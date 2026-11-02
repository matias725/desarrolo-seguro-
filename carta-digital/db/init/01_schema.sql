-- =============================================================
-- Carta Digital — Esquema PostgreSQL
-- Migrado desde el esquema MySQL original de pnkSecurity.
-- Cambios respecto al original:
--   * Tabla "restautantes" renombrada a "restaurantes" (error de tipeo).
--   * Claves foráneas reales (el original no tenía ninguna).
--   * BIT(1) -> BOOLEAN; DATETIME -> TIMESTAMP.
--   * Restricciones CHECK (precio >= 0, puntuación 0..5).
--   * usuarios.password (texto plano) -> usuarios.password_hash (bcrypt).
--   * comentarios ligado al usuario autenticado (usuario_id) y con fecha.
-- Este archivo se ejecuta solo en una base vacía (lo usa también
-- la imagen oficial de postgres desde /docker-entrypoint-initdb.d).
-- =============================================================

CREATE TABLE direcciones (
    id           SERIAL PRIMARY KEY,
    calle        VARCHAR(100) NOT NULL,
    numero       VARCHAR(15)  NOT NULL,
    comuna       VARCHAR(100) NOT NULL,
    region       VARCHAR(100),
    creado       TIMESTAMP NOT NULL DEFAULT NOW(),
    actualizado  TIMESTAMP,
    eliminado    TIMESTAMP
);

CREATE TABLE restaurantes (
    id              SERIAL PRIMARY KEY,
    rut             VARCHAR(12)  NOT NULL,
    nombre          VARCHAR(200) NOT NULL,
    fono            VARCHAR(45)  NOT NULL,
    mapa            VARCHAR(200),
    foto            VARCHAR(200),
    email           VARCHAR(100),
    creado          TIMESTAMP NOT NULL DEFAULT NOW(),
    actualizado     TIMESTAMP,
    eliminado       TIMESTAMP,
    direcciones_id  INTEGER NOT NULL REFERENCES direcciones(id)
);

CREATE TABLE cartas (
    id               SERIAL PRIMARY KEY,
    nombre           VARCHAR(45),
    orden            INTEGER,
    visible          BOOLEAN NOT NULL DEFAULT TRUE,
    foto             VARCHAR(200),
    creada           TIMESTAMP NOT NULL DEFAULT NOW(),
    actualizada      TIMESTAMP,
    eliminada        TIMESTAMP,
    restaurantes_id  INTEGER NOT NULL REFERENCES restaurantes(id)
);

CREATE TABLE categorias (
    id           SERIAL PRIMARY KEY,
    nombre       VARCHAR(100) NOT NULL,
    visible      BOOLEAN NOT NULL DEFAULT FALSE,
    foto         VARCHAR(200),
    orden        INTEGER,
    creado       TIMESTAMP NOT NULL DEFAULT NOW(),
    actualizado  TIMESTAMP,
    eliminado    TIMESTAMP,
    cartas_id    INTEGER NOT NULL REFERENCES cartas(id)
);

CREATE TABLE items (
    id             SERIAL PRIMARY KEY,
    nombre         VARCHAR(100) NOT NULL,
    descripcion    VARCHAR(300),
    tiempo         VARCHAR(100),
    observaciones  VARCHAR(300),
    precio         INTEGER CHECK (precio >= 0),
    visible        BOOLEAN NOT NULL DEFAULT FALSE,
    destacado      BOOLEAN NOT NULL DEFAULT FALSE,
    puntuacion     INTEGER NOT NULL DEFAULT 0 CHECK (puntuacion BETWEEN 0 AND 5),
    foto           VARCHAR(200),
    orden          INTEGER,
    creado         TIMESTAMP NOT NULL DEFAULT NOW(),
    actualizado    TIMESTAMP,
    eliminado      TIMESTAMP,
    categorias_id  INTEGER NOT NULL REFERENCES categorias(id)
);

CREATE TABLE usuarios (
    id             SERIAL PRIMARY KEY,
    nombre         VARCHAR(255) NOT NULL,
    email          VARCHAR(255) NOT NULL UNIQUE,
    password_hash  VARCHAR(255) NOT NULL,
    activo         BOOLEAN NOT NULL DEFAULT TRUE,
    creado         TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE comentarios (
    id               SERIAL PRIMARY KEY,
    comentario       VARCHAR(1000) NOT NULL,
    usuario_id       INTEGER NOT NULL REFERENCES usuarios(id),
    restaurantes_id  INTEGER NOT NULL REFERENCES restaurantes(id),
    creado           TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Tabla de sesiones (connect-pg-simple). Guardar la sesión en la BD
-- permite que funcione igual con varios contenedores de la app.
CREATE TABLE sesiones (
    sid     VARCHAR NOT NULL PRIMARY KEY,
    sess    JSON NOT NULL,
    expire  TIMESTAMP(6) NOT NULL
);
CREATE INDEX idx_sesiones_expire ON sesiones (expire);

-- Índices para las consultas de la carta
CREATE INDEX idx_cartas_restaurante  ON cartas (restaurantes_id);
CREATE INDEX idx_categorias_carta    ON categorias (cartas_id);
CREATE INDEX idx_items_categoria     ON items (categorias_id);
CREATE INDEX idx_comentarios_resto   ON comentarios (restaurantes_id);
