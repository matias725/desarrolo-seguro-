const { query } = require('../config/db');

async function buscarPorEmail(email) {
  const { rows } = await query(
    `SELECT id, nombre, email, password_hash, activo
       FROM usuarios
      WHERE email = $1`,
    [email]
  );
  return rows[0] || null;
}

async function crear({ nombre, email, passwordHash }) {
  const { rows } = await query(
    `INSERT INTO usuarios (nombre, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, nombre, email`,
    [nombre, email, passwordHash]
  );
  return rows[0];
}

module.exports = { buscarPorEmail, crear };
