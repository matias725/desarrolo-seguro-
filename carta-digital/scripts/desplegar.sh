#!/usr/bin/env bash
# =============================================================================
# Despliega una versión de Carta Digital en un ambiente de AWS (lo invoca Jenkins).
#
#   Uso:  scripts/desplegar.sh <ambiente> <version>
#   Ej.:  scripts/desplegar.sh qa 8541950            # commit (corto o completo)
#         scripts/desplegar.sh qa anterior           # vuelve a la versión previa
#
# Recursos que deben existir antes (los crea infra/crear-infra.sh):
#   Auto Scaling Group, target group y balanceador "carta-<ambiente>",
#   RDS "carta-<ambiente>-db" y los parámetros SSM /carta/<ambiente>/*.
#
# Qué hace (despliegue "rolling", sin cortar el servicio):
#   1. Comprueba los prerrequisitos y que el commit exista en GitHub.
#   2. Guarda la versión actual como "anterior" y publica la nueva en SSM
#      (/carta/<ambiente>/version): las instancias nuevas del Auto Scaling
#      arrancarán con ella.
#   3. Por cada instancia, de a una: la retira del balanceador, la actualiza
#      con SSM Run Command (infra/instancia-desplegar.sh), espera que esté
#      sana y la vuelve a registrar. La otra sigue atendiendo.
#   4. Verifica desde el dominio público que /health responde con la versión.
#
# Códigos de salida: 0 ok · 2 parámetros · 3 prerrequisitos · 4 falla en una
# instancia · 5 la verificación final no encontró la versión.
# =============================================================================
set -euo pipefail

AMB="${1:-}"; VERSION="${2:-}"
if [ -z "$AMB" ] || [ -z "$VERSION" ]; then
  echo "Uso: $0 <ambiente> <version|anterior>" >&2; exit 2
fi
[[ "$AMB" =~ ^[a-z0-9-]{2,20}$ ]] || { echo "Ambiente inválido: $AMB" >&2; exit 2; }
export AWS_DEFAULT_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
P="carta-$AMB"
DOMINIO="${DOMINIO:-carta-${AMB}.cartadigitalserena.app}"
REPO_URL="${REPO_URL:-https://github.com/matias725/desarrolo-seguro-.git}"

log() { printf '[desplegar %s] %s\n' "$(date +%H:%M:%S)" "$*"; }
falla() { local c=$1; shift; printf '[desplegar] ERROR: %s\n' "$*" >&2; exit "$c"; }

# ---------------------------------------------------------- 1. prerrequisitos
param() { aws ssm get-parameter --name "/carta/$AMB/$1" --query Parameter.Value --output text 2>/dev/null; }
ACTUAL=$(param version) || falla 3 "no existe /carta/$AMB/version (¿corriste infra/crear-infra.sh $AMB?)"
TG=$(aws elbv2 describe-target-groups --names "$P" --query 'TargetGroups[0].TargetGroupArn' --output text 2>/dev/null) || falla 3 "no existe el target group $P"
aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names "$P" --query 'AutoScalingGroups[0].AutoScalingGroupName' --output text | grep -qx "$P" || falla 3 "no existe el Auto Scaling Group $P"
ESTADO_DB=$(aws rds describe-db-instances --db-instance-identifier "$P-db" --query 'DBInstances[0].DBInstanceStatus' --output text 2>/dev/null) || falla 3 "no existe la RDS $P-db"
[ "$ESTADO_DB" = "available" ] || falla 3 "la RDS $P-db está '$ESTADO_DB'"

if [ "$VERSION" = "anterior" ]; then
  VERSION=$(param version_anterior) || falla 2 "no hay versión anterior registrada"
  log "volviendo a la versión anterior: $VERSION"
fi
[[ "$VERSION" =~ ^[0-9a-f]{7,40}$ ]] || falla 2 "la versión debe ser un commit (hex de 7 a 40 caracteres): $VERSION"

# El commit tiene que estar publicado en GitHub (las instancias lo descargan de ahí).
SHA=$(git rev-parse --verify -q "$VERSION^{commit}" 2>/dev/null || true)
[ -n "$SHA" ] || falla 2 "el commit $VERSION no existe en este repositorio"
git fetch -q "$REPO_URL" "$SHA" 2>/dev/null || git ls-remote "$REPO_URL" | grep -q "^$SHA" ||
  log "aviso: no pude confirmar que $SHA esté en GitHub; se intentará igual"
CORTO=${SHA:0:12}
log "ambiente=$AMB versión=$CORTO (actual: ${ACTUAL:0:12})"

# ---------------------------------------------------------- 2. publicar versión
[ "$ACTUAL" != "$SHA" ] && aws ssm put-parameter --name "/carta/$AMB/version_anterior" --type String --overwrite --value "$ACTUAL" >/dev/null
aws ssm put-parameter --name "/carta/$AMB/version" --type String --overwrite --value "$SHA" >/dev/null

# ---------------------------------------------------------- 3. rolling
INSTANCIAS=$(aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names "$P" \
  --query 'AutoScalingGroups[0].Instances[?LifecycleState==`InService`].InstanceId' --output text)
[ -n "$INSTANCIAS" ] || falla 3 "el Auto Scaling Group no tiene instancias en servicio"
log "instancias: $INSTANCIAS"

for ID in $INSTANCIAS; do
  log "[$ID] retirando del balanceador (espera a que terminen sus peticiones)"
  aws elbv2 deregister-targets --target-group-arn "$TG" --targets "Id=$ID,Port=3000"
  aws elbv2 wait target-deregistered --target-group-arn "$TG" --targets "Id=$ID,Port=3000"

  log "[$ID] actualizando a $CORTO con SSM Run Command"
  CMD=$(aws ssm send-command --instance-ids "$ID" --document-name AWS-RunShellScript \
    --comment "carta $AMB $CORTO" --timeout-seconds 900 \
    --parameters "commands=[\"set -e\",\"cd /opt/src\",\"git fetch -q origin\",\"git checkout -q --detach $SHA\",\"bash carta-digital/infra/instancia-desplegar.sh $SHA\"]" \
    --query Command.CommandId --output text)
  ESTADO=Pending
  for _ in $(seq 1 120); do
    ESTADO=$(aws ssm get-command-invocation --command-id "$CMD" --instance-id "$ID" --query Status --output text 2>/dev/null || echo Pending)
    case "$ESTADO" in Success|Failed|Cancelled|TimedOut) break ;; esac
    sleep 5
  done
  aws ssm get-command-invocation --command-id "$CMD" --instance-id "$ID" --query StandardOutputContent --output text | sed "s/^/  [$ID] /"
  if [ "$ESTADO" != "Success" ]; then
    aws ssm get-command-invocation --command-id "$CMD" --instance-id "$ID" --query StandardErrorContent --output text | tail -20 | sed "s/^/  [$ID] /" >&2
    falla 4 "la instancia $ID no pudo publicar $CORTO (estado: $ESTADO). Queda fuera del balanceador; la otra sigue atendiendo. Revierte con: $0 $AMB anterior"
  fi

  log "[$ID] registrando de nuevo en el balanceador"
  aws elbv2 register-targets --target-group-arn "$TG" --targets "Id=$ID,Port=3000"
  aws elbv2 wait target-in-service --target-group-arn "$TG" --targets "Id=$ID,Port=3000" ||
    falla 4 "la instancia $ID no quedó sana en el balanceador"
  log "[$ID] sana con la versión $CORTO"
done

# ---------------------------------------------------------- 4. verificación pública
log "verificando https://$DOMINIO/health"
OK=0
for _ in $(seq 1 10); do
  R=$(curl -fsS --max-time 10 "https://$DOMINIO/health" 2>/dev/null || true)
  if echo "$R" | grep -q "\"version\":\"$CORTO\""; then OK=$((OK + 1)); fi
  sleep 1
done
[ "$OK" -ge 8 ] || falla 5 "solo $OK de 10 respuestas de https://$DOMINIO/health traen la versión $CORTO"
log "OK: $OK/10 respuestas desde https://$DOMINIO con la versión $CORTO"
echo "VERSION_PUBLICADA=$CORTO"
