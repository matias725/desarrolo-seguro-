const { query } = require('../config/db');

async function buscarPorId(id) {
  const { rows } = await query(
    `SELECT r.id, r.nombre, r.fono, r.email, r.foto, r.mapa,
            d.calle, d.numero, d.comuna, d.region
       FROM restaurantes r
       JOIN direcciones d ON d.id = r.direcciones_id
      WHERE r.id = $1 AND r.eliminado IS NULL`,
    [id]
  );
  return rows[0] || null;
}

async function listar() {
  const { rows } = await query(
    `SELECT r.id, r.nombre, r.foto, d.comuna
       FROM restaurantes r
       JOIN direcciones d ON d.id = r.direcciones_id
      WHERE r.eliminado IS NULL
      ORDER BY r.nombre`
  );
  return rows;
}

// Búsqueda con filtros y paginación para la API.
async function buscar({ q, comuna, limite, desplazamiento }) {
  const { rows } = await query(
    `SELECT r.id, r.nombre, r.foto, r.fono, r.email, d.calle, d.numero, d.comuna, d.region,
            COUNT(*) OVER()::int AS total_filas
       FROM restaurantes r
       JOIN direcciones d ON d.id = r.direcciones_id
      WHERE r.eliminado IS NULL
        AND ($1::text IS NULL OR r.nombre ILIKE '%' || $1 || '%')
        AND ($2::text IS NULL OR d.comuna ILIKE $2)
      ORDER BY r.nombre
      LIMIT $3 OFFSET $4`,
    [q ?? null, comuna ?? null, limite, desplazamiento]
  );
  return rows;
}

// Números rápidos del restaurante: platos publicados, rango de precios, comentarios.
async function resumen(id) {
  const { rows } = await query(
    `SELECT
       (SELECT COUNT(*)::int FROM items i
          JOIN categorias cat ON cat.id = i.categorias_id
          JOIN cartas c ON c.id = cat.cartas_id
         WHERE c.restaurantes_id = $1 AND i.visible AND i.eliminado IS NULL
           AND cat.visible AND cat.eliminado IS NULL AND c.visible AND c.eliminada IS NULL) AS platos,
       (SELECT MIN(i.precio) FROM items i
          JOIN categorias cat ON cat.id = i.categorias_id
          JOIN cartas c ON c.id = cat.cartas_id
         WHERE c.restaurantes_id = $1 AND i.visible AND i.eliminado IS NULL
           AND cat.visible AND cat.eliminado IS NULL AND c.visible AND c.eliminada IS NULL) AS precio_minimo,
       (SELECT MAX(i.precio) FROM items i
          JOIN categorias cat ON cat.id = i.categorias_id
          JOIN cartas c ON c.id = cat.cartas_id
         WHERE c.restaurantes_id = $1 AND i.visible AND i.eliminado IS NULL
           AND cat.visible AND cat.eliminado IS NULL AND c.visible AND c.eliminada IS NULL) AS precio_maximo,
       (SELECT COUNT(*)::int FROM comentarios WHERE restaurantes_id = $1 AND NOT oculto) AS comentarios`,
    [id]
  );
  return rows[0];
}

module.exports = { buscarPorId, listar, buscar, resumen };
