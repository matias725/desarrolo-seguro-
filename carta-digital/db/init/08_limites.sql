-- =============================================================
-- Límites de peticiones compartidos entre instancias.
-- Con Auto Scaling hay varias instancias detrás del balanceador: si cada
-- una contara en su memoria, un atacante tendría N veces más intentos.
-- Guardando el contador en PostgreSQL el límite es el mismo para todas.
-- =============================================================
CREATE TABLE IF NOT EXISTS limites_peticiones (
    clave     VARCHAR(200) PRIMARY KEY,   -- limitador + IP
    hits      INTEGER      NOT NULL,
    reinicio  TIMESTAMPTZ  NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_limites_reinicio ON limites_peticiones (reinicio);
