#!/bin/bash
# Publica una versión de Carta Digital EN ESTA INSTANCIA. Lo usan:
#   - user-data.sh al crear la instancia, y
#   - scripts/desplegar.sh (vía SSM Run Command) en cada despliegue.
#
#   Uso (como root): instancia-desplegar.sh <version>   (commit, tag o rama)
#
# 1) Descarga la versión de Git, 2) construye la imagen Docker,
# 3) aplica db/desplegar.sql en RDS (idempotente, con bloqueo),
# 4) reemplaza el contenedor y 5) comprueba que /health responde con esa versión.
# Termina con código distinto de 0 si algo falla.
set -euo pipefail
VERSION="${1:?Uso: $0 <version>}"
# shellcheck disable=SC1091
. /etc/carta.conf   # AMB, REGION, DB_HOST, APP_URL

param() { aws ssm get-parameter --with-decryption --region "$REGION" --name "/carta/$AMB/$1" --query Parameter.Value --output text; }

cd /opt/src
git fetch -q --tags origin
if git rev-parse -q --verify "origin/$VERSION^{commit}" >/dev/null; then
  SHA=$(git rev-parse "origin/$VERSION^{commit}")
else
  SHA=$(git rev-parse --verify "$VERSION^{commit}")
fi
CORTO=${SHA:0:12}
git checkout -q --detach "$SHA"
echo "[carta] versión $VERSION -> commit $CORTO"

[ -s /opt/rds-ca.pem ] || curl -fsSL https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem -o /opt/rds-ca.pem

echo "[carta] construyendo la imagen carta-digital:$CORTO"
docker build -q -t "carta-digital:$CORTO" /opt/src/carta-digital >/dev/null

ADMIN_PASS=$(param db_admin_password)
APP_PASS=$(param db_app_password)
echo "[carta] aplicando db/desplegar.sql"
docker run --rm -e PGHOST="$DB_HOST" -e PGUSER=cartaadmin -e PGPASSWORD="$ADMIN_PASS" \
  -e PGDATABASE=carta_digital -e PGSSLMODE=verify-full -e PGSSLROOTCERT=/ca.pem \
  -v /opt/rds-ca.pem:/ca.pem:ro -v /opt/src/carta-digital/db:/db:ro \
  postgres:16-alpine psql -q -v ON_ERROR_STOP=1 -v app_user=carta_app -v app_pass="$APP_PASS" -f /db/desplegar.sql
unset ADMIN_PASS

# Variables de la app: archivo legible solo por root. La app se conecta con
# carta_app (mínimo privilegio), nunca con el usuario administrador de RDS.
umask 077
cat > /opt/carta.env <<ENV
NODE_ENV=production
PORT=3000
TRUST_PROXY=2
APP_URL=$APP_URL
APP_VERSION=$CORTO
API_DOCS=true
DB_HOST=$DB_HOST
DB_PORT=5432
DB_NAME=carta_digital
DB_USER=carta_app
DB_PASSWORD=$APP_PASS
DB_SSL=true
NODE_EXTRA_CA_CERTS=/etc/ssl/rds-ca.pem
SESSION_SECRET=$(param session_secret)
AWS_REGION=$REGION
ENV
if RESEND_KEY=$(param resend_api_key 2>/dev/null); then
  printf 'RESEND_API_KEY=%s\nCORREO_REMITENTE=Carta Digital <no-responder@cartadigitalserena.app>\n' "$RESEND_KEY" >> /opt/carta.env
fi
unset APP_PASS RESEND_KEY

# Identidad de la instancia (IMDSv2) para que /health diga quién respondió.
TOKEN=$(curl -fs -X PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 60')
printf 'INSTANCIA=%s\nZONA=%s\n' \
  "$(curl -fs -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/instance-id)" \
  "$(curl -fs -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/placement/availability-zone)" >> /opt/carta.env
unset TOKEN

echo "[carta] reemplazando el contenedor"
docker rm -f carta >/dev/null 2>&1 || true
docker run -d --name carta --restart unless-stopped -p 3000:3000 --env-file /opt/carta.env \
  -v /opt/rds-ca.pem:/etc/ssl/rds-ca.pem:ro "carta-digital:$CORTO" >/dev/null

# Ayudante para crear usuarios (ej: sudo carta-crear-usuario --admin)
cat > /usr/local/bin/carta-crear-usuario <<'AYUDA'
#!/bin/bash
exec docker exec -it carta node scripts/crear-usuario.js "$@"
AYUDA
chmod 755 /usr/local/bin/carta-crear-usuario

for i in $(seq 1 30); do
  if curl -fs http://127.0.0.1:3000/health | grep -q "\"version\":\"$CORTO\""; then
    echo "[carta] OK: la instancia responde con la versión $CORTO"
    docker image prune -af --filter "until=24h" >/dev/null 2>&1 || true
    exit 0
  fi
  sleep 3
done
echo "[carta] ERROR: /health no respondió con la versión $CORTO" >&2
docker logs --tail 30 carta >&2 || true
exit 1
