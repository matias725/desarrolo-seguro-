// Pool de conexiones a PostgreSQL.
// Todas las consultas del proyecto pasan por query(), que SIEMPRE usa
// parámetros ($1, $2, ...) — nunca se concatena texto del usuario en el SQL.
const { Pool } = require('pg');
const config = require('./env');
const logger = require('./logger');

const pool = new Pool({
  ...config.db,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error({ err: err.message }, 'error inesperado en el pool de PostgreSQL');
});

function query(texto, parametros = []) {
  return pool.query(texto, parametros);
}

// Ejecuta varias consultas como una sola unidad: si una falla, se deshacen
// todas (ej.: un pedido nunca queda guardado sin sus productos).
async function transaccion(fn) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await fn((texto, parametros = []) => cliente.query(texto, parametros));
    await cliente.query('COMMIT');
    return resultado;
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

module.exports = { pool, query, transaccion };
