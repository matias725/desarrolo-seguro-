#!/bin/sh
# Permisos del rol de la app para las funciones del backend v2.
# Se ejecuta después de 04_backend_v2.sql (Docker los corre en orden).
# A mano, sobre una base existente:
#   APP_DB_USER=carta_app POSTGRES_USER=postgres POSTGRES_DB=carta_digital sh 05_permisos_v2.sh
#
# Sigue el principio de mínimo privilegio:
#   - Catálogo (restaurantes, cartas, categorías, ítems): INSERT/UPDATE para el
#     panel de administración. Sin DELETE: se usa borrado lógico (eliminado = NOW()).
#   - Usuarios: INSERT (registro) y UPDATE (rol, activo, último login). Sin DELETE.
#   - Comentarios: UPDATE (ocultar) y DELETE (moderación).
#   - Pedidos: SELECT/INSERT/UPDATE. Sin DELETE.
#   - Auditoría: solo SELECT e INSERT: la app NO puede modificar ni borrar
#     el registro de auditoría.
set -e

if [ -z "$APP_DB_USER" ]; then
  echo "APP_DB_USER no definida: se omiten los permisos del backend v2"
  exit 0
fi

psql -v ON_ERROR_STOP=1 \
     --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
     -v app_user="$APP_DB_USER" <<'EOSQL'
GRANT INSERT, UPDATE ON direcciones, restaurantes, cartas, categorias, items TO :"app_user";
GRANT USAGE ON SEQUENCE direcciones_id_seq, restaurantes_id_seq, cartas_id_seq,
                        categorias_id_seq, items_id_seq TO :"app_user";

GRANT INSERT, UPDATE ON usuarios TO :"app_user";
GRANT USAGE ON SEQUENCE usuarios_id_seq TO :"app_user";

GRANT UPDATE, DELETE ON comentarios TO :"app_user";

GRANT SELECT, INSERT, UPDATE ON pedidos, pedido_items TO :"app_user";
GRANT USAGE ON SEQUENCE pedidos_id_seq, pedido_items_id_seq TO :"app_user";

GRANT SELECT, INSERT ON auditoria TO :"app_user";
GRANT USAGE ON SEQUENCE auditoria_id_seq TO :"app_user";
EOSQL
