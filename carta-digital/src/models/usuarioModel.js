const { query } = require('../config/db');

const COLUMNAS_PUBLICAS = 'id, nombre, email, rol, activo, creado, ultimo_login';

async function buscarPorEmail(email) {
  const { rows } = await query(
    `SELECT id, nombre, email, password_hash, activo, rol
       FROM usuarios
      WHERE email = $1`,
    [email]
  );
  return rows[0] || null;
}

async function buscarPorId(id) {
  const { rows } = await query(`SELECT ${COLUMNAS_PUBLICAS} FROM usuarios WHERE id = $1`, [id]);
  return rows[0] || null;
}

async function hashDe(id) {
  const { rows } = await query('SELECT password_hash FROM usuarios WHERE id = $1', [id]);
  return rows[0] ? rows[0].password_hash : null;
}

// El rol nunca viene del formulario de registro: siempre es 'cliente'
// salvo que lo indique el script de administración.
async function crear({ nombre, email, passwordHash, rol = 'cliente' }) {
  const { rows } = await query(
    `INSERT INTO usuarios (nombre, email, password_hash, rol)
     VALUES ($1, $2, $3, $4)
     RETURNING ${COLUMNAS_PUBLICAS}`,
    [nombre, email, passwordHash, rol]
  );
  return rows[0];
}

async function registrarLogin(id) {
  await query('UPDATE usuarios SET ultimo_login = NOW() WHERE id = $1', [id]);
}

async function cambiarPassword(id, passwordHash) {
  await query('UPDATE usuarios SET password_hash = $2 WHERE id = $1', [id, passwordHash]);
}

async function listar({ q, rol, limite, desplazamiento }) {
  const { rows } = await query(
    `SELECT ${COLUMNAS_PUBLICAS}, COUNT(*) OVER()::int AS total_filas
       FROM usuarios
      WHERE ($1::text IS NULL OR nombre ILIKE '%' || $1 || '%' OR email ILIKE '%' || $1 || '%')
        AND ($2::text IS NULL OR rol = $2)
      ORDER BY id
      LIMIT $3 OFFSET $4`,
    [q ?? null, rol ?? null, limite, desplazamiento]
  );
  return rows;
}

async function actualizar(id, { rol, activo }) {
  const { rows } = await query(
    `UPDATE usuarios
        SET rol = COALESCE($2, rol),
            activo = COALESCE($3, activo)
      WHERE id = $1
      RETURNING ${COLUMNAS_PUBLICAS}`,
    [id, rol ?? null, activo ?? null]
  );
  return rows[0] || null;
}

module.exports = { buscarPorEmail, buscarPorId, hashDe, crear, registrarLogin, cambiarPassword, listar, actualizar };
