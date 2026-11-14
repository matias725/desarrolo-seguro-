#!/bin/sh
# Permisos del rol de la app para las tablas de seguridad (06_seguridad.sql).
# A mano:  APP_DB_USER=carta_app POSTGRES_USER=postgres POSTGRES_DB=carta_digital sh 07_permisos_seguridad.sh
#   - intentos_login: se borra la fila al iniciar sesión bien o al desbloquear.
#   - tokens_recuperacion y alertas: sin DELETE (quedan como evidencia).
set -e

if [ -z "$APP_DB_USER" ]; then
  echo "APP_DB_USER no definida: se omiten los permisos de seguridad"
  exit 0
fi

psql -v ON_ERROR_STOP=1 \
     --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
     -v app_user="$APP_DB_USER" <<'EOSQL'
GRANT SELECT, INSERT, UPDATE, DELETE ON intentos_login TO :"app_user";
GRANT SELECT, INSERT, UPDATE ON tokens_recuperacion, alertas_seguridad TO :"app_user";
GRANT USAGE ON SEQUENCE tokens_recuperacion_id_seq, alertas_seguridad_id_seq TO :"app_user";
EOSQL
