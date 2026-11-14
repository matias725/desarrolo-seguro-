const { query } = require('../config/db');

// Devuelve las cartas visibles del restaurante con sus categorías e ítems
// ya anidados: [{ id, nombre, categorias: [{ id, nombre, items: [...] }] }]
// Se hace con 3 consultas (en vez de una por cada categoría como el original).
async function cartaCompleta(restauranteId) {
  const { rows: cartas } = await query(
    `SELECT id, nombre
       FROM cartas
      WHERE restaurantes_id = $1 AND visible AND eliminada IS NULL
      ORDER BY orden NULLS LAST, id`,
    [restauranteId]
  );
  if (cartas.length === 0) return [];

  const idsCartas = cartas.map((c) => c.id);
  const { rows: categorias } = await query(
    `SELECT id, nombre, cartas_id
       FROM categorias
      WHERE cartas_id = ANY($1::int[]) AND visible AND eliminado IS NULL
      ORDER BY orden NULLS LAST, id`,
    [idsCartas]
  );

  const idsCategorias = categorias.map((c) => c.id);
  const { rows: items } = idsCategorias.length
    ? await query(
        `SELECT id, nombre, descripcion, observaciones, tiempo, puntuacion,
                precio, foto, categorias_id
           FROM items
          WHERE categorias_id = ANY($1::int[]) AND visible AND eliminado IS NULL
          ORDER BY orden NULLS LAST, id`,
        [idsCategorias]
      )
    : { rows: [] };

  const categoriasPorCarta = new Map(idsCartas.map((id) => [id, []]));
  const itemsPorCategoria = new Map(idsCategorias.map((id) => [id, []]));
  for (const item of items) itemsPorCategoria.get(item.categorias_id).push(item);
  for (const cat of categorias) {
    categoriasPorCarta.get(cat.cartas_id).push({ ...cat, items: itemsPorCategoria.get(cat.id) });
  }
  return cartas.map((c) => ({ ...c, categorias: categoriasPorCarta.get(c.id) }));
}

async function destacados(restauranteId) {
  const { rows } = await query(
    `SELECT i.id, i.nombre, i.descripcion, i.observaciones, i.tiempo,
            i.puntuacion, i.precio, i.foto
       FROM items i
       JOIN categorias cat ON cat.id = i.categorias_id
       JOIN cartas c       ON c.id = cat.cartas_id
      WHERE c.restaurantes_id = $1
        AND i.destacado AND i.visible AND i.eliminado IS NULL
        AND cat.visible AND cat.eliminado IS NULL
        AND c.visible AND c.eliminada IS NULL
      ORDER BY i.orden NULLS LAST, i.id`,
    [restauranteId]
  );
  return rows;
}

// Busca un ítem disponible que pertenezca al restaurante indicado.
// Se usa para el carrito: el precio SIEMPRE sale de la BD, nunca del cliente.
async function itemDisponible(itemId, restauranteId) {
  const { rows } = await query(
    `SELECT i.id, i.nombre, i.precio
       FROM items i
       JOIN categorias cat ON cat.id = i.categorias_id
       JOIN cartas c       ON c.id = cat.cartas_id
      WHERE i.id = $1 AND c.restaurantes_id = $2
        AND i.visible AND i.eliminado IS NULL
        AND cat.visible AND cat.eliminado IS NULL
        AND c.visible AND c.eliminada IS NULL`,
    [itemId, restauranteId]
  );
  return rows[0] || null;
}

// Varios ítems de una vez (para armar un pedido con una sola consulta).
async function itemsDisponibles(itemIds, restauranteId) {
  if (itemIds.length === 0) return [];
  const { rows } = await query(
    `SELECT i.id, i.nombre, i.precio
       FROM items i
       JOIN categorias cat ON cat.id = i.categorias_id
       JOIN cartas c       ON c.id = cat.cartas_id
      WHERE i.id = ANY($1::int[]) AND c.restaurantes_id = $2
        AND i.visible AND i.eliminado IS NULL
        AND cat.visible AND cat.eliminado IS NULL
        AND c.visible AND c.eliminada IS NULL`,
    [itemIds, restauranteId]
  );
  return rows;
}

const ORDENES = {
  nombre: 'i.nombre ASC',
  precio_asc: 'i.precio ASC NULLS LAST, i.nombre',
  precio_desc: 'i.precio DESC NULLS LAST, i.nombre',
  puntuacion: 'i.puntuacion DESC, i.nombre',
};

// Búsqueda de platos publicados. Sin restauranteId busca en todos.
// El ORDER BY sale de una lista fija (ORDENES), nunca del texto del usuario.
async function buscarPlatos({ restauranteId, q, precioMin, precioMax, destacado, orden = 'nombre', limite, desplazamiento }) {
  const { rows } = await query(
    `SELECT i.id, i.nombre, i.descripcion, i.observaciones, i.tiempo, i.puntuacion,
            i.precio, i.foto, i.destacado,
            cat.id AS categoria_id, cat.nombre AS categoria,
            r.id AS restaurante_id, r.nombre AS restaurante,
            COUNT(*) OVER()::int AS total_filas
       FROM items i
       JOIN categorias cat  ON cat.id = i.categorias_id
       JOIN cartas c        ON c.id = cat.cartas_id
       JOIN restaurantes r  ON r.id = c.restaurantes_id
      WHERE i.visible AND i.eliminado IS NULL
        AND cat.visible AND cat.eliminado IS NULL
        AND c.visible AND c.eliminada IS NULL
        AND r.eliminado IS NULL
        AND ($1::int  IS NULL OR r.id = $1)
        AND ($2::text IS NULL OR i.nombre ILIKE '%' || $2 || '%' OR i.descripcion ILIKE '%' || $2 || '%')
        AND ($3::int  IS NULL OR i.precio >= $3)
        AND ($4::int  IS NULL OR i.precio <= $4)
        AND ($5::boolean IS NULL OR i.destacado = $5)
      ORDER BY ${ORDENES[orden] || ORDENES.nombre}
      LIMIT $6 OFFSET $7`,
    [restauranteId ?? null, q ?? null, precioMin ?? null, precioMax ?? null, destacado ?? null, limite, desplazamiento]
  );
  return rows;
}

module.exports = { cartaCompleta, destacados, itemDisponible, itemsDisponibles, buscarPlatos, ORDENES };
