#!/usr/bin/env bash
# Base de datos efímera para las pruebas de Jenkins (PostgreSQL 16 en Docker).
#
#   scripts/ci/bd-pruebas.sh iniciar <nombre>   -> imprime las variables DB_* para exportar
#   scripts/ci/bd-pruebas.sh borrar  <nombre>
#
# Usa el MISMO db/desplegar.sql que producción (esquema, migraciones y permisos
# mínimos del rol carta_app). Las contraseñas son aleatorias y de un solo uso.
set -euo pipefail
ACCION="${1:?iniciar|borrar}"; NOMBRE="${2:-carta-ci-bd}"
DIR="$(cd "$(dirname "$0")/../.." && pwd)"

case "$ACCION" in
  iniciar)
    SUPER=$(openssl rand -hex 16); APP=$(openssl rand -hex 16)
    docker rm -f "$NOMBRE" >/dev/null 2>&1 || true
    docker run -d --name "$NOMBRE" -e POSTGRES_PASSWORD="$SUPER" -e POSTGRES_DB=carta_digital \
      -p 127.0.0.1::5432 postgres:16-alpine >/dev/null
    for _ in $(seq 1 30); do docker exec "$NOMBRE" pg_isready -q -U postgres && break; sleep 1; done
    sleep 2
    docker cp "$DIR/db" "$NOMBRE":/db
    docker exec -e PGPASSWORD="$SUPER" "$NOMBRE" psql -q -U postgres -d carta_digital -v ON_ERROR_STOP=1 \
      -v app_user=carta_app -v app_pass="$APP" -f /db/desplegar.sql >&2
    PUERTO=$(docker port "$NOMBRE" 5432/tcp | head -1 | awk -F: '{print $NF}')
    echo "DB_HOST=127.0.0.1"
    echo "DB_PORT=$PUERTO"
    echo "DB_NAME=carta_digital"
    echo "DB_USER=carta_app"
    echo "DB_PASSWORD=$APP"
    ;;
  borrar)
    docker rm -f "$NOMBRE" >/dev/null 2>&1 || true
    ;;
  *) echo "acción desconocida: $ACCION" >&2; exit 2 ;;
esac
