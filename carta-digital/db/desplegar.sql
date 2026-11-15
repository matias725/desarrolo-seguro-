-- =============================================================
-- Script ÚNICO de despliegue de la base de datos (idempotente).
-- Lo ejecuta cada instancia al arrancar, con el usuario administrador:
--
--   psql -v ON_ERROR_STOP=1 -v app_user=carta_app -v app_pass="$APP_PASS" \
--        -f db/desplegar.sql
--
-- * Base vacía      -> crea el esquema y carga los datos de ejemplo.
-- * Base existente  -> aplica solo las migraciones (todas son IF NOT EXISTS).
-- * Rol de la app   -> lo crea si no existe y le da permisos MÍNIMOS.
-- Un advisory lock evita que dos instancias lo ejecuten a la vez.
-- Las próximas migraciones se agregan aquí: no hay que tocar AWS.
-- =============================================================
\set ON_ERROR_STOP on
SELECT pg_advisory_lock(42);

SELECT current_database() AS dbname \gset

SELECT to_regclass('public.restaurantes') IS NULL AS esquema_nuevo \gset
\if :esquema_nuevo
  \echo '[db] base vacía: creando esquema y datos de ejemplo'
  \ir init/01_schema.sql
  \ir init/02_datos.sql
\endif

\echo '[db] aplicando migraciones'
\ir init/04_backend_v2.sql
\ir init/06_seguridad.sql
\ir init/08_limites.sql

SELECT NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user') AS rol_nuevo \gset
\if :rol_nuevo
  \echo '[db] creando el rol de la aplicación'
  CREATE ROLE :"app_user" LOGIN PASSWORD :'app_pass';
\endif

\echo '[db] permisos del rol de la aplicación (mínimo privilegio)'
GRANT CONNECT ON DATABASE :"dbname" TO :"app_user";
GRANT USAGE ON SCHEMA public TO :"app_user";
-- v1: lectura del catálogo, comentarios y sesiones
GRANT SELECT ON direcciones, restaurantes, cartas, categorias, items, usuarios, comentarios TO :"app_user";
GRANT INSERT ON comentarios TO :"app_user";
GRANT USAGE ON SEQUENCE comentarios_id_seq TO :"app_user";
GRANT SELECT, INSERT, UPDATE, DELETE ON sesiones TO :"app_user";
-- v2: administración, pedidos y auditoría (ver 05_permisos_v2.sh)
GRANT INSERT, UPDATE ON direcciones, restaurantes, cartas, categorias, items TO :"app_user";
GRANT USAGE ON SEQUENCE direcciones_id_seq, restaurantes_id_seq, cartas_id_seq, categorias_id_seq, items_id_seq TO :"app_user";
GRANT INSERT, UPDATE ON usuarios TO :"app_user";
GRANT USAGE ON SEQUENCE usuarios_id_seq TO :"app_user";
GRANT UPDATE, DELETE ON comentarios TO :"app_user";
GRANT SELECT, INSERT, UPDATE ON pedidos, pedido_items TO :"app_user";
GRANT USAGE ON SEQUENCE pedidos_id_seq, pedido_items_id_seq TO :"app_user";
GRANT SELECT, INSERT ON auditoria TO :"app_user";
GRANT USAGE ON SEQUENCE auditoria_id_seq TO :"app_user";
-- Seguridad de cuentas (ver 07_permisos_seguridad.sh)
GRANT SELECT, INSERT, UPDATE, DELETE ON intentos_login TO :"app_user";
GRANT SELECT, INSERT, UPDATE ON tokens_recuperacion, alertas_seguridad TO :"app_user";
GRANT USAGE ON SEQUENCE tokens_recuperacion_id_seq, alertas_seguridad_id_seq TO :"app_user";
-- Límites compartidos entre instancias
GRANT SELECT, INSERT, UPDATE, DELETE ON limites_peticiones TO :"app_user";

SELECT pg_advisory_unlock(42);
\echo '[db] despliegue de la base terminado'
