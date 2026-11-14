const { query } = require('../config/db');
const logger = require('../config/logger');

// Registra una acción. Si la escritura falla no se corta la petición del
// usuario, pero queda el error en los logs.
async function registrar({ usuarioId = null, accion, entidad = null, entidadId = null, detalle = null, ip = null }) {
  try {
    await query(
      `INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, detalle, ip)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [usuarioId, accion, entidad, entidadId, detalle ? JSON.stringify(detalle) : null, ip]
    );
  } catch (err) {
    logger.error({ err: err.message, accion }, 'no se pudo registrar la auditoría');
  }
}

// Atajo desde un controlador: toma el usuario y la IP de la petición.
function desde(req, accion, { entidad, entidadId, detalle, usuarioId } = {}) {
  return registrar({
    usuarioId: usuarioId ?? (req.session && req.session.usuario ? req.session.usuario.id : null),
    accion,
    entidad,
    entidadId,
    detalle,
    ip: req.ip,
  });
}

async function listar({ accion, usuarioId, entidad, limite, desplazamiento }) {
  const { rows } = await query(
    `SELECT a.id, a.accion, a.entidad, a.entidad_id, a.detalle, a.ip, a.creado,
            a.usuario_id, u.nombre AS usuario,
            COUNT(*) OVER()::int AS total_filas
       FROM auditoria a
       LEFT JOIN usuarios u ON u.id = a.usuario_id
      WHERE ($1::text IS NULL OR a.accion = $1)
        AND ($2::int  IS NULL OR a.usuario_id = $2)
        AND ($3::text IS NULL OR a.entidad = $3)
      ORDER BY a.creado DESC, a.id DESC
      LIMIT $4 OFFSET $5`,
    [accion ?? null, usuarioId ?? null, entidad ?? null, limite, desplazamiento]
  );
  return rows;
}

module.exports = { registrar, desde, listar };
