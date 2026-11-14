-- =============================================================
-- Carta Digital — Backend v2
-- Agrega: roles de usuario, moderación de comentarios, pedidos
-- guardados en la BD y tabla de auditoría.
--
-- Es idempotente (IF NOT EXISTS): se puede ejecutar sobre una base
-- nueva (Docker lo corre tras 01..03) o sobre una existente con
--   npm run db:migrate
-- =============================================================

-- ---- Usuarios: rol y último acceso
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol VARCHAR(20) NOT NULL DEFAULT 'cliente';
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_login TIMESTAMP;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_rol_check') THEN
    ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check CHECK (rol IN ('cliente', 'admin'));
  END IF;
END $$;

-- ---- Comentarios: moderación (el admin puede ocultarlos sin borrarlos)
ALTER TABLE comentarios ADD COLUMN IF NOT EXISTS oculto BOOLEAN NOT NULL DEFAULT FALSE;

-- ---- Pedidos
-- "codigo" es aleatorio (no correlativo) para que nadie pueda ver pedidos
-- ajenos probando números (IDOR).
CREATE TABLE IF NOT EXISTS pedidos (
    id               SERIAL PRIMARY KEY,
    codigo           VARCHAR(12)  NOT NULL UNIQUE,
    restaurantes_id  INTEGER      NOT NULL REFERENCES restaurantes(id),
    usuario_id       INTEGER      REFERENCES usuarios(id),
    mesa             VARCHAR(10),
    nota             VARCHAR(300),
    estado           VARCHAR(20)  NOT NULL DEFAULT 'pendiente'
                     CHECK (estado IN ('pendiente', 'preparando', 'listo', 'entregado', 'cancelado')),
    total            INTEGER      NOT NULL CHECK (total >= 0),
    creado           TIMESTAMP    NOT NULL DEFAULT NOW(),
    actualizado      TIMESTAMP
);

-- Nombre y precio se copian al momento del pedido: si después cambia la
-- carta, el pedido conserva lo que realmente se cobró.
CREATE TABLE IF NOT EXISTS pedido_items (
    id               SERIAL PRIMARY KEY,
    pedido_id        INTEGER      NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    item_id          INTEGER      NOT NULL REFERENCES items(id),
    nombre           VARCHAR(100) NOT NULL,
    precio_unitario  INTEGER      NOT NULL CHECK (precio_unitario >= 0),
    cantidad         INTEGER      NOT NULL CHECK (cantidad BETWEEN 1 AND 20),
    subtotal         INTEGER      NOT NULL CHECK (subtotal >= 0)
);

-- ---- Auditoría: quién hizo qué, cuándo y desde dónde
CREATE TABLE IF NOT EXISTS auditoria (
    id          BIGSERIAL PRIMARY KEY,
    usuario_id  INTEGER REFERENCES usuarios(id),
    accion      VARCHAR(60)  NOT NULL,
    entidad     VARCHAR(40),
    entidad_id  INTEGER,
    detalle     JSONB,
    ip          VARCHAR(64),
    creado      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pedidos_restaurante   ON pedidos (restaurantes_id, creado DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_usuario       ON pedidos (usuario_id, creado DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_estado        ON pedidos (estado);
CREATE INDEX IF NOT EXISTS idx_pedido_items_pedido   ON pedido_items (pedido_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_creado      ON auditoria (creado DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario     ON auditoria (usuario_id);

-- Los datos de ejemplo cargan ids fijos: se ajustan las secuencias para que
-- los INSERT del panel de administración no choquen con ellos.
SELECT setval(pg_get_serial_sequence('direcciones', 'id'),  GREATEST((SELECT MAX(id) FROM direcciones), 1));
SELECT setval(pg_get_serial_sequence('restaurantes', 'id'), GREATEST((SELECT MAX(id) FROM restaurantes), 1));
SELECT setval(pg_get_serial_sequence('cartas', 'id'),       GREATEST((SELECT MAX(id) FROM cartas), 1));
SELECT setval(pg_get_serial_sequence('categorias', 'id'),   GREATEST((SELECT MAX(id) FROM categorias), 1));
SELECT setval(pg_get_serial_sequence('items', 'id'),        GREATEST((SELECT MAX(id) FROM items), 1));
