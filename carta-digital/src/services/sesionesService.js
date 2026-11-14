// Gestión de las sesiones de un usuario (guardadas en PostgreSQL por connect-pg-simple).
// Al usuario nunca se le muestra el id real de sesión (sid): con él se podría
// suplantar la sesión. Se usa un identificador derivado (hash).
const { query } = require('../config/db');
const { sha256 } = require('./cifrado');

const idPublico = (sid) => sha256(`sesion:${sid}`).slice(0, 16);

async function listar(usuarioId, sidActual) {
  const { rows } = await query(
    `SELECT sid, sess, expire FROM sesiones
      WHERE (sess->'usuario'->>'id')::int = $1 AND expire > NOW()
      ORDER BY expire DESC`,
    [usuarioId]
  );
  return rows.map((r) => {
    const meta = (r.sess && r.sess.meta) || {};
    return {
      id: idPublico(r.sid),
      actual: r.sid === sidActual,
      ip: meta.ip || null,
      navegador: meta.agente || null,
      inicio: meta.creada || null,
      expira: r.expire,
    };
  });
}

// Cierra todas las sesiones del usuario (opcionalmente menos la actual).
async function cerrarTodas(usuarioId, excepto = null) {
  const { rowCount } = await query(
    `DELETE FROM sesiones WHERE (sess->'usuario'->>'id')::int = $1 AND ($2::text IS NULL OR sid <> $2)`,
    [usuarioId, excepto]
  );
  return rowCount;
}

async function cerrarUna(usuarioId, id) {
  const { rows } = await query(`SELECT sid FROM sesiones WHERE (sess->'usuario'->>'id')::int = $1`, [usuarioId]);
  const sesion = rows.find((r) => idPublico(r.sid) === id);
  if (!sesion) return null;
  await query('DELETE FROM sesiones WHERE sid = $1', [sesion.sid]);
  return sesion.sid;
}

module.exports = { listar, cerrarTodas, cerrarUna, idPublico };
