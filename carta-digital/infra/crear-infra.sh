#!/usr/bin/env bash
# =============================================================================
# Crea (o completa) la infraestructura de un ambiente de Carta Digital en AWS.
# Idempotente: si un recurso ya existe, lo reutiliza.
#
#   Uso:  infra/crear-infra.sh <ambiente> [arn-del-certificado-acm]
#   Ej.:  infra/crear-infra.sh qa
#         infra/crear-infra.sh qa arn:aws:acm:us-east-1:123456789012:certificate/xxxx
#
# Crea:
#   - Grupos de seguridad: ALB (80/443 público) -> app (3000 solo desde el ALB)
#     -> RDS (5432 solo desde la app).
#   - Secretos en SSM Parameter Store (SecureString, generados al azar).
#   - RDS PostgreSQL 16 Multi-AZ, cifrada, SIN acceso público.
#   - Plantilla de lanzamiento (Amazon Linux 2023, IMDSv2, rol LabInstanceProfile).
#   - Target group con ruta de salud /health, ALB y Auto Scaling Group con
#     2 instancias repartidas en 2 zonas de disponibilidad + escalado por CPU.
#
# Requisitos: AWS CLI v2 con credenciales del Learner Lab, openssl.
# Nunca imprime contraseñas: se generan y se guardan directo en SSM.
# =============================================================================
set -euo pipefail

AMB="${1:?Uso: $0 <ambiente> [arn-certificado]}"
CERT_ARN="${2:-}"
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
export AWS_DEFAULT_REGION="$REGION"
REPO_URL="${REPO_URL:-https://github.com/matias725/desarrolo-seguro-.git}"
DOMINIO="${DOMINIO:-carta-${AMB}.cartadigitalserena.app}"
ZONAS=(us-east-1a us-east-1b)          # las dos zonas de disponibilidad
TIPO_APP="${TIPO_APP:-t3.small}"
TIPO_DB="${TIPO_DB:-db.t3.micro}"
P="carta-${AMB}"                       # prefijo de nombres
DIR="$(cd "$(dirname "$0")" && pwd)"

log() { printf '[infra %s] %s\n' "$(date +%H:%M:%S)" "$*" >&2; }
etiquetas() { echo "Key=Proyecto,Value=carta-digital Key=Ambiente,Value=$AMB"; }

# --------------------------------------------------------------------- red
VPC=$(aws ec2 describe-vpcs --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text)
[ "$VPC" = "None" ] && { echo "No hay VPC por defecto" >&2; exit 1; }
SUBNETS=()
for z in "${ZONAS[@]}"; do
  s=$(aws ec2 describe-subnets --filters Name=vpc-id,Values="$VPC" Name=availability-zone,Values="$z" Name=default-for-az,Values=true --query 'Subnets[0].SubnetId' --output text)
  SUBNETS+=("$s")
done
TODAS_SUBNETS=$(aws ec2 describe-subnets --filters Name=vpc-id,Values="$VPC" --query 'Subnets[].SubnetId' --output text)
log "VPC $VPC, subredes de la app: ${SUBNETS[*]} (${ZONAS[*]})"

# ------------------------------------------------------- grupos de seguridad
sg() { # nombre descripcion -> id
  local id
  id=$(aws ec2 describe-security-groups --filters Name=vpc-id,Values="$VPC" Name=group-name,Values="$1" --query 'SecurityGroups[0].GroupId' --output text)
  if [ "$id" = "None" ]; then
    id=$(aws ec2 create-security-group --vpc-id "$VPC" --group-name "$1" --description "$2" \
      --tag-specifications "ResourceType=security-group,Tags=[{Key=Name,Value=$1},{Key=Proyecto,Value=carta-digital},{Key=Ambiente,Value=$AMB}]" \
      --query GroupId --output text)
    log "grupo de seguridad $1 creado ($id)"
  fi
  echo "$id"
}
permitir() { # sg puerto origen(cidr|sg)
  local origen
  if [[ "$3" == sg-* ]]; then origen="UserIdGroupPairs=[{GroupId=$3}]"; else origen="IpRanges=[{CidrIp=$3}]"; fi
  aws ec2 authorize-security-group-ingress --group-id "$1" \
    --ip-permissions "IpProtocol=tcp,FromPort=$2,ToPort=$2,$origen" >/dev/null 2>&1 || true
}
SG_ALB=$(sg "$P-alb" "Balanceador: HTTP/HTTPS publico")
SG_APP=$(sg "$P-app" "App Node.js: puerto 3000 solo desde el balanceador")
SG_DB=$(sg "$P-db" "RDS PostgreSQL: 5432 solo desde la app")
permitir "$SG_ALB" 80 0.0.0.0/0
permitir "$SG_ALB" 443 0.0.0.0/0
permitir "$SG_APP" 3000 "$SG_ALB"
permitir "$SG_DB" 5432 "$SG_APP"

# ------------------------------------------------------- secretos (SSM)
secreto() { # nombre -> crea si no existe (nunca se imprime)
  if ! aws ssm get-parameter --name "/carta/$AMB/$1" >/dev/null 2>&1; then
    aws ssm put-parameter --name "/carta/$AMB/$1" --type SecureString \
      --value "$(openssl rand -base64 36 | tr -dc 'A-Za-z0-9' | head -c 40)" >/dev/null
    log "secreto /carta/$AMB/$1 generado"
  fi
}
secreto db_admin_password
secreto db_app_password
secreto session_secret
# Versión (commit) que deben ejecutar las instancias. La cambia desplegar.sh.
aws ssm get-parameter --name "/carta/$AMB/version" >/dev/null 2>&1 ||
  aws ssm put-parameter --name "/carta/$AMB/version" --type String --value "${VERSION_INICIAL:-entrega-4}" >/dev/null

# ------------------------------------------------------- RDS Multi-AZ
if ! aws rds describe-db-subnet-groups --db-subnet-group-name "$P-db" >/dev/null 2>&1; then
  # shellcheck disable=SC2086
  aws rds create-db-subnet-group --db-subnet-group-name "$P-db" \
    --db-subnet-group-description "Subredes de RDS ($AMB)" --subnet-ids $TODAS_SUBNETS >/dev/null
  log "grupo de subredes de RDS creado"
fi
if ! aws rds describe-db-instances --db-instance-identifier "$P-db" >/dev/null 2>&1; then
  ADMIN_PASS=$(aws ssm get-parameter --with-decryption --name "/carta/$AMB/db_admin_password" --query Parameter.Value --output text)
  aws rds create-db-instance --db-instance-identifier "$P-db" \
    --engine postgres --engine-version 16 --db-instance-class "$TIPO_DB" \
    --allocated-storage 20 --storage-type gp3 --storage-encrypted \
    --master-username cartaadmin --master-user-password "$ADMIN_PASS" \
    --db-name carta_digital --multi-az --no-publicly-accessible \
    --vpc-security-group-ids "$SG_DB" --db-subnet-group-name "$P-db" \
    --backup-retention-period 1 --no-deletion-protection \
    --tags $(etiquetas) >/dev/null
  unset ADMIN_PASS
  log "RDS $P-db (Multi-AZ, privada) en creación: tarda ~15 minutos"
fi
log "esperando a que la RDS esté disponible…"
aws rds wait db-instance-available --db-instance-identifier "$P-db"
DB_HOST=$(aws rds describe-db-instances --db-instance-identifier "$P-db" --query 'DBInstances[0].Endpoint.Address' --output text)
log "RDS lista: $DB_HOST"

# ------------------------------------------------------- plantilla de lanzamiento
AMI=$(aws ssm get-parameter --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 --query Parameter.Value --output text)
USERDATA=$(sed -e "s|@@AMB@@|$AMB|g" -e "s|@@REGION@@|$REGION|g" -e "s|@@REPO_URL@@|$REPO_URL|g" \
  -e "s|@@DB_HOST@@|$DB_HOST|g" -e "s|@@APP_URL@@|https://$DOMINIO|g" "$DIR/user-data.sh" | base64 -w0)
DATOS_LT=$(cat <<JSON
{"ImageId":"$AMI","InstanceType":"$TIPO_APP","IamInstanceProfile":{"Name":"LabInstanceProfile"},
 "SecurityGroupIds":["$SG_APP"],"UserData":"$USERDATA",
 "MetadataOptions":{"HttpTokens":"required","HttpEndpoint":"enabled","HttpPutResponseHopLimit":2},
 "TagSpecifications":[{"ResourceType":"instance","Tags":[{"Key":"Name","Value":"$P-app"},{"Key":"Proyecto","Value":"carta-digital"},{"Key":"Ambiente","Value":"$AMB"}]}]}
JSON
)
if aws ec2 describe-launch-templates --launch-template-names "$P" >/dev/null 2>&1; then
  V=$(aws ec2 create-launch-template-version --launch-template-name "$P" --launch-template-data "$DATOS_LT" --query LaunchTemplateVersion.VersionNumber --output text)
  aws ec2 modify-launch-template --launch-template-name "$P" --default-version "$V" >/dev/null
  log "plantilla $P actualizada (v$V)"
else
  aws ec2 create-launch-template --launch-template-name "$P" --launch-template-data "$DATOS_LT" >/dev/null
  log "plantilla $P creada"
fi

# ------------------------------------------------------- balanceador
TG=$(aws elbv2 describe-target-groups --names "$P" --query 'TargetGroups[0].TargetGroupArn' --output text 2>/dev/null || true)
if [ -z "$TG" ] || [ "$TG" = "None" ]; then
  TG=$(aws elbv2 create-target-group --name "$P" --protocol HTTP --port 3000 --vpc-id "$VPC" \
    --health-check-path /health --health-check-interval-seconds 10 --healthy-threshold-count 2 \
    --unhealthy-threshold-count 3 --matcher HttpCode=200 --query 'TargetGroups[0].TargetGroupArn' --output text)
  # Al retirar un destino, espera 30 s a que terminen sus peticiones en curso.
  aws elbv2 modify-target-group-attributes --target-group-arn "$TG" \
    --attributes Key=deregistration_delay.timeout_seconds,Value=30 >/dev/null
  log "target group $P creado (salud: /health)"
fi
ALB=$(aws elbv2 describe-load-balancers --names "$P" --query 'LoadBalancers[0].LoadBalancerArn' --output text 2>/dev/null || true)
if [ -z "$ALB" ] || [ "$ALB" = "None" ]; then
  # shellcheck disable=SC2086
  ALB=$(aws elbv2 create-load-balancer --name "$P" --type application --scheme internet-facing \
    --subnets ${SUBNETS[*]} --security-groups "$SG_ALB" --tags $(etiquetas) \
    --query 'LoadBalancers[0].LoadBalancerArn' --output text)
  aws elbv2 modify-load-balancer-attributes --load-balancer-arn "$ALB" \
    --attributes Key=routing.http.drop_invalid_header_fields.enabled,Value=true >/dev/null
  log "balanceador $P creado"
fi
oyente() { aws elbv2 describe-listeners --load-balancer-arn "$ALB" --query "Listeners[?Port==\`$1\`].ListenerArn" --output text; }
if [ -n "$CERT_ARN" ]; then
  [ -z "$(oyente 443)" ] && aws elbv2 create-listener --load-balancer-arn "$ALB" --protocol HTTPS --port 443 \
    --certificates CertificateArn="$CERT_ARN" --ssl-policy ELBSecurityPolicy-TLS13-1-2-2021-06 \
    --default-actions Type=forward,TargetGroupArn="$TG" >/dev/null && log "oyente HTTPS 443 creado"
  L80=$(oyente 80)
  ACCION_80='Type=redirect,RedirectConfig={Protocol=HTTPS,Port=443,StatusCode=HTTP_301}'
  if [ -z "$L80" ]; then
    aws elbv2 create-listener --load-balancer-arn "$ALB" --protocol HTTP --port 80 --default-actions "$ACCION_80" >/dev/null
  else
    aws elbv2 modify-listener --listener-arn "$L80" --default-actions "$ACCION_80" >/dev/null
  fi
else
  [ -z "$(oyente 80)" ] && aws elbv2 create-listener --load-balancer-arn "$ALB" --protocol HTTP --port 80 \
    --default-actions Type=forward,TargetGroupArn="$TG" >/dev/null && log "oyente HTTP 80 creado (sin certificado aún)"
fi

# ------------------------------------------------------- Auto Scaling (2 zonas)
if [ "$(aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names "$P" --query 'length(AutoScalingGroups)' --output text)" = "0" ]; then
  aws autoscaling create-auto-scaling-group --auto-scaling-group-name "$P" \
    --launch-template "LaunchTemplateName=$P,Version=\$Default" \
    --min-size 2 --max-size 4 --desired-capacity 2 \
    --vpc-zone-identifier "$(IFS=,; echo "${SUBNETS[*]}")" \
    --target-group-arns "$TG" --health-check-type ELB --health-check-grace-period 600 \
    --tags "Key=Proyecto,Value=carta-digital,PropagateAtLaunch=true" "Key=Ambiente,Value=$AMB,PropagateAtLaunch=true"
  aws autoscaling put-scaling-policy --auto-scaling-group-name "$P" --policy-name "$P-cpu50" \
    --policy-type TargetTrackingScaling --estimated-instance-warmup 300 \
    --target-tracking-configuration '{"PredefinedMetricSpecification":{"PredefinedMetricType":"ASGAverageCPUUtilization"},"TargetValue":50.0}' >/dev/null
  log "Auto Scaling $P creado: 2 instancias en ${ZONAS[*]}, escala por CPU 50 %"
fi

DNS=$(aws elbv2 describe-load-balancers --load-balancer-arns "$ALB" --query 'LoadBalancers[0].DNSName' --output text)
log "listo. Balanceador: $DNS"
log "En Cloudflare: CNAME ${DOMINIO%%.*} -> $DNS (proxy activado, SSL Full strict)"
