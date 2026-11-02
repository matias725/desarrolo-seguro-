#!/bin/sh
# Crea un rol de base de datos con privilegios mínimos para la aplicación
# (solo lectura de la carta; escritura solo en comentarios y sesiones).
# Lo ejecuta la imagen oficial de postgres desde /docker-entrypoint-initdb.d
# si están definidas APP_DB_USER y APP_DB_PASSWORD. Para hacerlo a mano:
#   APP_DB_USER=carta_app APP_DB_PASSWORD=... POSTGRES_USER=postgres POSTGRES_DB=carta_digital sh 03_usuario_app.sh
set -e

if [ -z "$APP_DB_USER" ] || [ -z "$APP_DB_PASSWORD" ]; then
  echo "APP_DB_USER / APP_DB_PASSWORD no definidas: se omite la creación del rol de la app"
  exit 0
fi

psql -v ON_ERROR_STOP=1 \
     --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
     -v app_user="$APP_DB_USER" -v app_pass="$APP_DB_PASSWORD" <<'EOSQL'
CREATE ROLE :"app_user" LOGIN PASSWORD :'app_pass';
GRANT CONNECT ON DATABASE :"DBNAME" TO :"app_user";
GRANT USAGE ON SCHEMA public TO :"app_user";
GRANT SELECT ON direcciones, restaurantes, cartas, categorias, items, usuarios, comentarios TO :"app_user";
GRANT INSERT ON comentarios TO :"app_user";
GRANT USAGE ON SEQUENCE comentarios_id_seq TO :"app_user";
GRANT SELECT, INSERT, UPDATE, DELETE ON sesiones TO :"app_user";
EOSQL
