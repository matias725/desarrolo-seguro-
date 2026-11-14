const { query } = require('../config/db');

// Comentarios visibles en la carta (los ocultados por un admin no salen).
async function listarPorRestaurante(restauranteId, { limite = 100, desplazamiento = 0 } = {}) {
  const { rows } = await query(
    `SELECT co.id, co.comentario, co.creado, u.nombre AS usuario,
            COUNT(*) OVER()::int AS total_filas
       FROM comentarios co
       JOIN usuarios u ON u.id = co.usuario_id
      WHERE co.restaurantes_id = $1 AND NOT co.oculto
      ORDER BY co.creado DESC
      LIMIT $2 OFFSET $3`,
    [restauranteId, limite, desplazamiento]
  );
  return rows;
}

async function crear({ comentario, usuarioId, restauranteId }) {
  const { rows } = await query(
    `INSERT INTO comentarios (comentario, usuario_id, restaurantes_id)
     VALUES ($1, $2, $3)
     RETURNING id, comentario, creado`,
    [comentario, usuarioId, restauranteId]
  );
  return rows[0];
}

// ---- Moderación (admin)
async function listarAdmin({ restauranteId, oculto, limite, desplazamiento }) {
  const { rows } = await query(
    `SELECT co.id, co.comentario, co.oculto, co.creado,
            co.restaurantes_id, r.nombre AS restaurante,
            u.id AS usuario_id, u.nombre AS usuario, u.email,
            COUNT(*) OVER()::int AS total_filas
       FROM comentarios co
       JOIN usuarios u     ON u.id = co.usuario_id
       JOIN restaurantes r ON r.id = co.restaurantes_id
      WHERE ($1::int IS NULL OR co.restaurantes_id = $1)
        AND ($2::boolean IS NULL OR co.oculto = $2)
      ORDER BY co.creado DESC
      LIMIT $3 OFFSET $4`,
    [restauranteId ?? null, oculto ?? null, limite, desplazamiento]
  );
  return rows;
}

async function cambiarVisibilidad(id, oculto) {
  const { rows } = await query(
    'UPDATE comentarios SET oculto = $2 WHERE id = $1 RETURNING id, comentario, oculto',
    [id, oculto]
  );
  return rows[0] || null;
}

async function eliminar(id) {
  const { rowCount } = await query('DELETE FROM comentarios WHERE id = $1', [id]);
  return rowCount > 0;
}

module.exports = { listarPorRestaurante, crear, listarAdmin, cambiarVisibilidad, eliminar };
