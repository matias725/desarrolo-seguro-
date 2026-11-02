// Pool de conexiones a PostgreSQL.
// Todas las consultas del proyecto pasan por query(), que SIEMPRE usa
// parámetros ($1, $2, ...) — nunca se concatena texto del usuario en el SQL.
const { Pool } = require('pg');
const config = require('./env');

const pool = new Pool({
  ...config.db,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[db] error inesperado en el pool:', err.message);
});

function query(texto, parametros = []) {
  return pool.query(texto, parametros);
}

module.exports = { pool, query };
