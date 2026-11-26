#!/usr/bin/env bash
# =============================================================================
# Prueba de continuidad: pide /health por el dominio de Cloudflare cada 0,5 s
# mientras retira de forma controlada UNA instancia del balanceador y luego la
# restituye. Registra cada respuesta (hora, código HTTP, instancia, zona,
# latencia) y al final resume errores e interrupciones.
#
#   Uso:  scripts/continuidad.sh <ambiente> [segundos-por-fase]
#   Ej.:  scripts/continuidad.sh qa 20
#
# Fases: ANTES (ambos destinos sanos) -> DURANTE (uno retirado) -> DESPUES
# (restituido y sano). Salida: reportes/continuidad.csv y un resumen.
# Código de salida 1 si hubo respuestas con error.
# =============================================================================
set -euo pipefail
AMB="${1:?Uso: $0 <ambiente> [segundos-por-fase]}"
FASE_S="${2:-20}"
export AWS_DEFAULT_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
DOMINIO="${DOMINIO:-carta-${AMB}.cartadigitalserena.app}"
URL="https://$DOMINIO/health"
mkdir -p reportes
CSV=reportes/continuidad.csv
echo "hora,fase,http,instancia,zona,latencia_ms" > "$CSV"

TG=$(aws elbv2 describe-target-groups --names "carta-$AMB" --query 'TargetGroups[0].TargetGroupArn' --output text)
salud() { aws elbv2 describe-target-health --target-group-arn "$TG" --query 'TargetHealthDescriptions[].[Target.Id,TargetHealth.State]' --output text | tr '\t\n' ': '; }
log() { printf '[continuidad %s] %s\n' "$(date +%H:%M:%S)" "$*"; }

FASE=ANTES
sondear() { # corre en segundo plano y escribe en el CSV
  while :; do
    local ini fin cuerpo http inst zona
    ini=$(date +%s%3N)
    cuerpo=$(curl -s --max-time 5 -w '\n%{http_code}' -H 'Cache-Control: no-cache' "$URL?t=$ini" || printf '\n000')
    fin=$(date +%s%3N)
    http=$(tail -1 <<<"$cuerpo")
    inst=$(grep -o '"instancia":"[^"]*"' <<<"$cuerpo" | cut -d'"' -f4 || true)
    zona=$(grep -o '"zona":"[^"]*"' <<<"$cuerpo" | cut -d'"' -f4 || true)
    echo "$(date +%H:%M:%S.%3N),$(cat /tmp/continuidad.fase),$http,${inst:--},${zona:--},$((fin - ini))" >> "$CSV"
    sleep 0.5
  done
}

echo ANTES > /tmp/continuidad.fase
log "destinos: $(salud)"
sondear & SONDA=$!
trap 'kill $SONDA 2>/dev/null || true' EXIT

sleep "$FASE_S"
RETIRADA=$(aws elbv2 describe-target-health --target-group-arn "$TG" --query 'TargetHealthDescriptions[0].Target.Id' --output text)
echo DURANTE > /tmp/continuidad.fase
log "retirando $RETIRADA del balanceador (deregistration delay 30 s)"
T0=$(date +%s)
aws elbv2 deregister-targets --target-group-arn "$TG" --targets "Id=$RETIRADA,Port=3000"
aws elbv2 wait target-deregistered --target-group-arn "$TG" --targets "Id=$RETIRADA,Port=3000"
log "retirada completa en $(( $(date +%s) - T0 )) s. Destinos: $(salud)"
sleep "$FASE_S"

log "restituyendo $RETIRADA"
aws elbv2 register-targets --target-group-arn "$TG" --targets "Id=$RETIRADA,Port=3000"
aws elbv2 wait target-in-service --target-group-arn "$TG" --targets "Id=$RETIRADA,Port=3000"
echo DESPUES > /tmp/continuidad.fase
log "restituida y sana. Destinos: $(salud)"
sleep "$FASE_S"
kill $SONDA 2>/dev/null || true; wait $SONDA 2>/dev/null || true

echo
echo "fase      total  ok(200)  errores  instancias que respondieron"
for f in ANTES DURANTE DESPUES; do
  awk -F, -v f=$f 'NR>1 && $2==f { t++; if ($3==200) ok++; else e++; i[$4]++ }
    END { s=""; for (k in i) s=s k "(" i[k] ") "; printf "%-8s %6d %8d %8d  %s\n", f, t, ok, e, s }' "$CSV"
done
ERRORES=$(awk -F, 'NR>1 && $3!=200' "$CSV" | wc -l)
# Interrupción: mayor tramo continuo de respuestas con error (en segundos).
awk -F, 'NR>1 { split($1,h,":"); t=h[1]*3600+h[2]*60+h[3];
  if ($3!=200) { if (!ini) ini=t; fin=t } else if (ini) { d=fin-ini+0.5; if (d>max) max=d; ini=0 } }
  END { if (ini) { d=fin-ini+0.5; if (d>max) max=d } printf "Mayor interrupción: %.1f s\n", max }' "$CSV"
echo "Respuestas con error: $ERRORES · Detalle: $CSV"
[ "$ERRORES" -eq 0 ]
