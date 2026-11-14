-- =============================================================
-- Carta Digital — Seguridad de cuentas
--   * Bloqueo por cuenta tras intentos fallidos (intentos_login)
--   * Doble factor TOTP (columnas totp_* en usuarios)
--   * Recuperación de contraseña (tokens_recuperacion)
--   * Alertas de seguridad (alertas_seguridad)
-- Idempotente: se puede aplicar con  npm run db:migrate
-- =============================================================

-- ---- 2FA (TOTP). El secreto se guarda CIFRADO (AES-256-GCM), nunca en claro.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS totp_secreto      TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS totp_pendiente    TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS totp_activo       BOOLEAN NOT NULL DEFAULT FALSE;
-- Último intervalo de 30 s usado: impide reutilizar un mismo código (anti-replay).
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS totp_ultimo_paso  BIGINT;
-- Códigos de respaldo de un solo uso (solo su hash SHA-256).
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS totp_respaldo     JSONB NOT NULL DEFAULT '[]';
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS password_cambiada TIMESTAMP;

-- ---- Bloqueo por cuenta. La clave es el CORREO (exista o no la cuenta):
-- así el bloqueo se comporta igual para correos inexistentes y no sirve
-- para averiguar qué cuentas existen.
CREATE TABLE IF NOT EXISTS intentos_login (
    email            VARCHAR(255) PRIMARY KEY,
    fallos           INTEGER   NOT NULL DEFAULT 0,
    primer_fallo     TIMESTAMP NOT NULL DEFAULT NOW(),
    bloqueado_hasta  TIMESTAMP,
    ultima_ip        VARCHAR(64)
);

-- ---- Recuperación de contraseña: se guarda el HASH del token, no el token.
CREATE TABLE IF NOT EXISTS tokens_recuperacion (
    id          SERIAL PRIMARY KEY,
    usuario_id  INTEGER   NOT NULL REFERENCES usuarios(id),
    token_hash  CHAR(64)  NOT NULL UNIQUE,
    expira      TIMESTAMP NOT NULL,
    usado       TIMESTAMP,
    ip          VARCHAR(64),
    creado      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ---- Alertas de seguridad para los administradores
CREATE TABLE IF NOT EXISTS alertas_seguridad (
    id            SERIAL PRIMARY KEY,
    tipo          VARCHAR(40) NOT NULL,
    severidad     VARCHAR(10) NOT NULL CHECK (severidad IN ('baja', 'media', 'alta')),
    usuario_id    INTEGER REFERENCES usuarios(id),
    detalle       JSONB,
    ip            VARCHAR(64),
    revisada      BOOLEAN NOT NULL DEFAULT FALSE,
    revisada_por  INTEGER REFERENCES usuarios(id),
    creado        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auditoria_accion_creado  ON auditoria (accion, creado DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario_accion ON auditoria (usuario_id, accion, creado DESC);
CREATE INDEX IF NOT EXISTS idx_tokens_usuario           ON tokens_recuperacion (usuario_id, creado DESC);
CREATE INDEX IF NOT EXISTS idx_alertas_creado           ON alertas_seguridad (creado DESC);
CREATE INDEX IF NOT EXISTS idx_alertas_pendientes       ON alertas_seguridad (revisada, severidad);
