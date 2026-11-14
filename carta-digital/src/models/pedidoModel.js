const crypto = require('crypto');
const { query, transaccion } = require('../config/db');

// Flujo permitido de estados. Cualquier otro cambio se rechaza (409).
const TRANSICIONES = {
  pendiente: ['preparando', 'cancelado'],
  preparando: ['listo', 'cancelado'],
  listo: ['entregado'],
  entregado: [],
  cancelado: [],
};
const ESTADOS = Object.keys(TRANSICIONES);

// Código aleatorio legible (sin 0/O/1/I para dictarlo sin confusión).
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generarCodigo(largo = 8) {
  const bytes = crypto.randomBytes(largo);
  let codigo = '';
  for (const b of bytes) codigo += ALFABETO[b % ALFABETO.length];
  return codigo;
}

// lineas: [{ id, nombre, precio, cantidad }] — ya validadas contra la BD.
async function crear({ restauranteId, usuarioId, mesa, nota, lineas }) {
  const total = lineas.reduce((suma, l) => suma + l.precio * l.cantidad, 0);
  return transaccion(async (q) => {
    let pedido;
    // Reintento ante la (muy improbable) colisión del código único.
    for (let intento = 0; !pedido; intento++) {
      try {
        const { rows } = await q(
          `INSERT INTO pedidos (codigo, restaurantes_id, usuario_id, mesa, nota, total)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, codigo, estado, total, mesa, nota, creado`,
          [generarCodigo(), restauranteId, usuarioId ?? null, mesa ?? null, nota ?? null, total]
        );
        pedido = rows[0];
      } catch (err) {
        if (err.code !== '23505' || intento >= 3) throw err;
      }
    }
    for (const l of lineas) {
      await q(
        `INSERT INTO pedido_items (pedido_id, item_id, nombre, precio_unitario, cantidad, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [pedido.id, l.id, l.nombre, l.precio, l.cantidad, l.precio * l.cantidad]
      );
    }
    return pedido;
  });
}

async function detalle(where, valor) {
  const { rows } = await query(
    `SELECT p.id, p.codigo, p.estado, p.total, p.mesa, p.nota, p.creado, p.actualizado,
            p.usuario_id, p.restaurantes_id, r.nombre AS restaurante,
            COALESCE(json_agg(json_build_object(
              'itemId', pi.item_id, 'nombre', pi.nombre, 'precioUnitario', pi.precio_unitario,
              'cantidad', pi.cantidad, 'subtotal', pi.subtotal) ORDER BY pi.id)
              FILTER (WHERE pi.id IS NOT NULL), '[]') AS items
       FROM pedidos p
       JOIN restaurantes r ON r.id = p.restaurantes_id
       LEFT JOIN pedido_items pi ON pi.pedido_id = p.id
      WHERE ${where} = $1
      GROUP BY p.id, r.nombre`,
    [valor]
  );
  return rows[0] || null;
}

const buscarPorCodigo = (codigo) => detalle('p.codigo', codigo);
const buscarPorId = (id) => detalle('p.id', id);

async function listar({ usuarioId, restauranteId, estado, desde, hasta, limite, desplazamiento }) {
  const { rows } = await query(
    `SELECT p.id, p.codigo, p.estado, p.total, p.mesa, p.creado, p.actualizado,
            p.restaurantes_id, r.nombre AS restaurante, p.usuario_id, u.nombre AS usuario,
            (SELECT COALESCE(SUM(cantidad), 0)::int FROM pedido_items WHERE pedido_id = p.id) AS productos,
            COUNT(*) OVER()::int AS total_filas
       FROM pedidos p
       JOIN restaurantes r ON r.id = p.restaurantes_id
       LEFT JOIN usuarios u ON u.id = p.usuario_id
      WHERE ($1::int  IS NULL OR p.usuario_id = $1)
        AND ($2::int  IS NULL OR p.restaurantes_id = $2)
        AND ($3::text IS NULL OR p.estado = $3)
        AND ($4::date IS NULL OR p.creado >= $4)
        AND ($5::date IS NULL OR p.creado < $5::date + 1)
      ORDER BY p.creado DESC, p.id DESC
      LIMIT $6 OFFSET $7`,
    [usuarioId ?? null, restauranteId ?? null, estado ?? null, desde ?? null, hasta ?? null, limite, desplazamiento]
  );
  return rows;
}

// Cambia el estado solo si la transición es válida y nadie lo cambió entre
// medio (el WHERE incluye el estado anterior: evita condiciones de carrera).
async function cambiarEstado(id, estadoActual, estadoNuevo) {
  const { rows } = await query(
    `UPDATE pedidos SET estado = $3, actualizado = NOW()
      WHERE id = $1 AND estado = $2
      RETURNING id, codigo, estado, actualizado`,
    [id, estadoActual, estadoNuevo]
  );
  return rows[0] || null;
}

async function estadisticas({ desde, hasta }) {
  const params = [desde ?? null, hasta ?? null];
  const filtro = `($1::date IS NULL OR p.creado >= $1) AND ($2::date IS NULL OR p.creado < $2::date + 1)`;
  const [porEstado, porRestaurante, topPlatos, porDia] = await Promise.all([
    query(`SELECT estado, COUNT(*)::int AS pedidos FROM pedidos p WHERE ${filtro} GROUP BY estado ORDER BY estado`, params),
    query(
      `SELECT r.id, r.nombre, COUNT(p.id)::int AS pedidos, COALESCE(SUM(p.total), 0)::int AS ventas
         FROM pedidos p JOIN restaurantes r ON r.id = p.restaurantes_id
        WHERE ${filtro} AND p.estado <> 'cancelado'
        GROUP BY r.id ORDER BY ventas DESC`,
      params
    ),
    query(
      `SELECT pi.item_id, pi.nombre, r.nombre AS restaurante,
              SUM(pi.cantidad)::int AS unidades, SUM(pi.subtotal)::int AS ventas
         FROM pedido_items pi
         JOIN pedidos p ON p.id = pi.pedido_id
         JOIN restaurantes r ON r.id = p.restaurantes_id
        WHERE ${filtro} AND p.estado <> 'cancelado'
        GROUP BY pi.item_id, pi.nombre, r.nombre
        ORDER BY unidades DESC LIMIT 10`,
      params
    ),
    query(
      `SELECT to_char(date_trunc('day', p.creado), 'YYYY-MM-DD') AS dia,
              COUNT(*)::int AS pedidos, COALESCE(SUM(p.total), 0)::int AS ventas
         FROM pedidos p
        WHERE ${filtro} AND p.estado <> 'cancelado'
        GROUP BY 1 ORDER BY 1 DESC LIMIT 31`,
      params
    ),
  ]);
  const ventas = porRestaurante.rows.reduce((s, r) => s + r.ventas, 0);
  const pedidos = porRestaurante.rows.reduce((s, r) => s + r.pedidos, 0);
  return {
    resumen: { pedidos, ventas, ticketPromedio: pedidos ? Math.round(ventas / pedidos) : 0 },
    porEstado: porEstado.rows,
    porRestaurante: porRestaurante.rows,
    platosMasPedidos: topPlatos.rows,
    porDia: porDia.rows,
  };
}

module.exports = { TRANSICIONES, ESTADOS, crear, buscarPorCodigo, buscarPorId, listar, cambiarEstado, estadisticas };
