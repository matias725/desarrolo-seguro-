// Administración del catálogo: restaurantes, cartas, categorías e ítems.
// - Los nombres de tablas y columnas vienen de listas fijas en este archivo;
//   los valores siempre van como parámetros ($1, $2...).
// - Borrar = borrado lógico (eliminado = NOW()): se conserva el historial y
//   los pedidos antiguos siguen apuntando a ítems existentes.
const { query, transaccion } = require('../config/db');

// Tabla -> columnas editables, nombre de las columnas de fechas y padre.
const ENTIDADES = {
  restaurantes: {
    columnas: ['rut', 'nombre', 'fono', 'mapa', 'foto', 'email'],
    actualizado: 'actualizado',
    eliminado: 'eliminado',
  },
  cartas: {
    columnas: ['nombre', 'orden', 'visible', 'foto'],
    actualizado: 'actualizada',
    eliminado: 'eliminada',
    padre: { tabla: 'restaurantes', columna: 'restaurantes_id' },
  },
  categorias: {
    columnas: ['nombre', 'orden', 'visible', 'foto'],
    actualizado: 'actualizado',
    eliminado: 'eliminado',
    padre: { tabla: 'cartas', columna: 'cartas_id' },
  },
  items: {
    columnas: ['nombre', 'descripcion', 'tiempo', 'observaciones', 'precio', 'visible', 'destacado', 'puntuacion', 'foto', 'orden'],
    actualizado: 'actualizado',
    eliminado: 'eliminado',
    padre: { tabla: 'categorias', columna: 'categorias_id' },
  },
};

const COLUMNAS_DIRECCION = ['calle', 'numero', 'comuna', 'region'];

function soloPermitidas(datos, permitidas) {
  return Object.entries(datos).filter(([col, valor]) => permitidas.includes(col) && valor !== undefined);
}

async function existeActivo(tabla, id, q = query) {
  const e = ENTIDADES[tabla];
  const { rows } = await q(`SELECT id FROM ${tabla} WHERE id = $1 AND ${e.eliminado} IS NULL`, [id]);
  return rows.length > 0;
}

// INSERT genérico para cartas, categorías e ítems (cuelgan de un padre).
async function crearHijo(tabla, padreId, datos) {
  const e = ENTIDADES[tabla];
  if (!(await existeActivo(e.padre.tabla, padreId))) return null;
  const pares = soloPermitidas(datos, e.columnas);
  const columnas = [...pares.map(([c]) => c), e.padre.columna];
  const valores = [...pares.map(([, v]) => v), padreId];
  const marcadores = valores.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await query(
    `INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES (${marcadores}) RETURNING *`,
    valores
  );
  return rows[0];
}

// UPDATE genérico: solo columnas permitidas y solo si no está eliminado.
async function actualizar(tabla, id, datos, q = query) {
  const e = ENTIDADES[tabla];
  const pares = soloPermitidas(datos, e.columnas);
  if (pares.length === 0) {
    const { rows } = await q(`SELECT * FROM ${tabla} WHERE id = $1 AND ${e.eliminado} IS NULL`, [id]);
    return rows[0] || null;
  }
  const sets = pares.map(([c], i) => `${c} = $${i + 2}`);
  const { rows } = await q(
    `UPDATE ${tabla} SET ${sets.join(', ')}, ${e.actualizado} = NOW()
      WHERE id = $1 AND ${e.eliminado} IS NULL
      RETURNING *`,
    [id, ...pares.map(([, v]) => v)]
  );
  return rows[0] || null;
}

async function eliminar(tabla, id) {
  const e = ENTIDADES[tabla];
  const { rowCount } = await query(
    `UPDATE ${tabla} SET ${e.eliminado} = NOW() WHERE id = $1 AND ${e.eliminado} IS NULL`,
    [id]
  );
  return rowCount > 0;
}

// ---- Restaurantes (llevan una dirección asociada)
const SELECT_RESTAURANTE = `
  SELECT r.id, r.rut, r.nombre, r.fono, r.mapa, r.foto, r.email,
         r.creado, r.actualizado, r.eliminado,
         json_build_object('calle', d.calle, 'numero', d.numero, 'comuna', d.comuna, 'region', d.region) AS direccion
    FROM restaurantes r JOIN direcciones d ON d.id = r.direcciones_id`;

async function listarRestaurantes({ incluirEliminados, limite, desplazamiento }) {
  const { rows } = await query(
    `${SELECT_RESTAURANTE.replace('r.eliminado,', 'r.eliminado, COUNT(*) OVER()::int AS total_filas,')}
      WHERE ($1::boolean OR r.eliminado IS NULL)
      ORDER BY r.id
      LIMIT $2 OFFSET $3`,
    [Boolean(incluirEliminados), limite, desplazamiento]
  );
  return rows;
}

async function obtenerRestaurante(id) {
  const { rows } = await query(`${SELECT_RESTAURANTE} WHERE r.id = $1`, [id]);
  return rows[0] || null;
}

async function crearRestaurante({ direccion, ...datos }) {
  const id = await transaccion(async (q) => {
    const dir = soloPermitidas(direccion, COLUMNAS_DIRECCION);
    const { rows: [d] } = await q(
      `INSERT INTO direcciones (${dir.map(([c]) => c).join(', ')})
       VALUES (${dir.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
      dir.map(([, v]) => v)
    );
    const pares = soloPermitidas(datos, ENTIDADES.restaurantes.columnas);
    const columnas = [...pares.map(([c]) => c), 'direcciones_id'];
    const valores = [...pares.map(([, v]) => v), d.id];
    const { rows: [r] } = await q(
      `INSERT INTO restaurantes (${columnas.join(', ')})
       VALUES (${valores.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
      valores
    );
    return r.id;
  });
  return obtenerRestaurante(id);
}

async function actualizarRestaurante(id, { direccion, ...datos }) {
  const ok = await transaccion(async (q) => {
    const r = await actualizar('restaurantes', id, datos, q);
    if (!r) return false;
    const dir = soloPermitidas(direccion || {}, COLUMNAS_DIRECCION);
    if (dir.length) {
      await q(
        `UPDATE direcciones SET ${dir.map(([c], i) => `${c} = $${i + 2}`).join(', ')}, actualizado = NOW()
          WHERE id = $1`,
        [r.direcciones_id, ...dir.map(([, v]) => v)]
      );
    }
    return true;
  });
  return ok ? obtenerRestaurante(id) : null;
}

async function restaurarRestaurante(id) {
  const { rowCount } = await query(
    'UPDATE restaurantes SET eliminado = NULL, actualizado = NOW() WHERE id = $1 AND eliminado IS NOT NULL',
    [id]
  );
  return rowCount > 0;
}

// Carta completa para el admin: incluye lo oculto (visible = false),
// excluye solo lo eliminado.
async function cartaAdmin(restauranteId) {
  const { rows } = await query(
    `SELECT c.id, c.nombre, c.orden, c.visible, c.foto,
            COALESCE((
              SELECT json_agg(json_build_object(
                       'id', cat.id, 'nombre', cat.nombre, 'orden', cat.orden, 'visible', cat.visible, 'foto', cat.foto,
                       'items', COALESCE((
                          SELECT json_agg(json_build_object(
                                   'id', i.id, 'nombre', i.nombre, 'descripcion', i.descripcion, 'tiempo', i.tiempo,
                                   'observaciones', i.observaciones, 'precio', i.precio, 'visible', i.visible,
                                   'destacado', i.destacado, 'puntuacion', i.puntuacion, 'foto', i.foto, 'orden', i.orden)
                                 ORDER BY i.orden NULLS LAST, i.id)
                            FROM items i WHERE i.categorias_id = cat.id AND i.eliminado IS NULL), '[]'))
                     ORDER BY cat.orden NULLS LAST, cat.id)
                FROM categorias cat WHERE cat.cartas_id = c.id AND cat.eliminado IS NULL), '[]') AS categorias
       FROM cartas c
      WHERE c.restaurantes_id = $1 AND c.eliminada IS NULL
      ORDER BY c.orden NULLS LAST, c.id`,
    [restauranteId]
  );
  return rows;
}

module.exports = {
  crearHijo,
  actualizar,
  eliminar,
  existeActivo,
  listarRestaurantes,
  obtenerRestaurante,
  crearRestaurante,
  actualizarRestaurante,
  restaurarRestaurante,
  cartaAdmin,
};
