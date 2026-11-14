const { query } = require('../config/db');

async function crear({ tipo, severidad, usuarioId = null, detalle = null, ip = null }) {
  const { rows } = await query(
    `INSERT INTO alertas_seguridad (tipo, severidad, usuario_id, detalle, ip)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, tipo, severidad, creado`,
    [tipo, severidad, usuarioId, detalle ? JSON.stringify(detalle) : null, ip]
  );
  return rows[0];
}

// ¿Ya hay una alerta igual reciente? (evita inundar a los admins con duplicados)
async function existeReciente({ tipo, usuarioId, ip, minutos = 15 }) {
  const { rows } = await query(
    `SELECT 1 FROM alertas_seguridad
      WHERE tipo = $1
        AND ($2::int IS NULL OR usuario_id = $2)
        AND ($3::text IS NULL OR ip = $3)
        AND creado > NOW() - make_interval(mins => $4)
      LIMIT 1`,
    [tipo, usuarioId ?? null, ip ?? null, minutos]
  );
  return rows.length > 0;
}

async function listar({ revisada, severidad, tipo, limite, desplazamiento }) {
  const { rows } = await query(
    `SELECT a.id, a.tipo, a.severidad, a.detalle, a.ip, a.revisada, a.creado,
            a.usuario_id, u.nombre AS usuario, u.email,
            a.revisada_por, r.nombre AS revisada_por_nombre,
            COUNT(*) OVER()::int AS total_filas
       FROM alertas_seguridad a
       LEFT JOIN usuarios u ON u.id = a.usuario_id
       LEFT JOIN usuarios r ON r.id = a.revisada_por
      WHERE ($1::boolean IS NULL OR a.revisada = $1)
        AND ($2::text IS NULL OR a.severidad = $2)
        AND ($3::text IS NULL OR a.tipo = $3)
      ORDER BY a.revisada, a.creado DESC
      LIMIT $4 OFFSET $5`,
    [revisada ?? null, severidad ?? null, tipo ?? null, limite, desplazamiento]
  );
  return rows;
}

async function marcarRevisada(id, revisada, adminId) {
  const { rows } = await query(
    `UPDATE alertas_seguridad SET revisada = $2, revisada_por = CASE WHEN $2 THEN $3::int ELSE NULL END
      WHERE id = $1 RETURNING id, tipo, severidad, revisada`,
    [id, revisada, adminId]
  );
  return rows[0] || null;
}

async function resumen() {
  const { rows } = await query(
    `SELECT severidad, COUNT(*)::int AS pendientes FROM alertas_seguridad
      WHERE NOT revisada GROUP BY severidad`
  );
  return Object.fromEntries(['alta', 'media', 'baja'].map((s) => [s, (rows.find((r) => r.severidad === s) || {}).pendientes || 0]));
}

module.exports = { crear, existeReciente, listar, marcarRevisada, resumen };
