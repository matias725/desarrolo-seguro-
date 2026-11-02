const { query } = require('../config/db');

async function listarPorRestaurante(restauranteId) {
  const { rows } = await query(
    `SELECT co.id, co.comentario, co.creado, u.nombre AS usuario
       FROM comentarios co
       JOIN usuarios u ON u.id = co.usuario_id
      WHERE co.restaurantes_id = $1
      ORDER BY co.creado DESC
      LIMIT 100`,
    [restauranteId]
  );
  return rows;
}

async function crear({ comentario, usuarioId, restauranteId }) {
  await query(
    `INSERT INTO comentarios (comentario, usuario_id, restaurantes_id)
     VALUES ($1, $2, $3)`,
    [comentario, usuarioId, restauranteId]
  );
}

module.exports = { listarPorRestaurante, crear };
