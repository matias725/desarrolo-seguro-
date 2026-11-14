// Pedidos: el cliente confirma su carrito y la cocina (admin) lo avanza
// por los estados pendiente → preparando → listo → entregado.
const Restaurante = require('../../models/restauranteModel');
const Carta = require('../../models/cartaModel');
const Pedido = require('../../models/pedidoModel');
const Auditoria = require('../../models/auditoriaModel');
const Carrito = require('../../services/carritoService');
const { paginado } = require('./publicoController');
const { ok, httpError, noEncontrado, paginacion } = require('../../utils/http');

// Datos públicos de un pedido (sin datos personales del cliente).
function vistaPublica(p) {
  const { id, usuario_id, restaurantes_id, ...resto } = p;
  return { ...resto, restauranteId: restaurantes_id, siguientesEstados: Pedido.TRANSICIONES[p.estado] };
}

// POST /restaurantes/:id/pedidos
async function crear(req, res) {
  const restaurante = await Restaurante.buscarPorId(req.valid.params.id);
  if (!restaurante) throw noEncontrado('Restaurante');
  const { mesa, nota, items } = req.valid.body;

  // Sin "items" en el cuerpo se usa el carrito de la sesión.
  const pedidos = new Map();
  if (items) {
    for (const { itemId, cantidad } of items) pedidos.set(itemId, Math.min((pedidos.get(itemId) || 0) + cantidad, Carrito.MAX_POR_ITEM));
  } else {
    for (const [itemId, cantidad] of Object.entries(Carrito.carritoDe(req, restaurante.id))) pedidos.set(Number(itemId), cantidad);
  }
  if (pedidos.size === 0) throw httpError(400, 'El pedido está vacío: agrega productos al carrito');

  // Precios y disponibilidad SIEMPRE desde la BD.
  const disponibles = await Carta.itemsDisponibles([...pedidos.keys()], restaurante.id);
  if (disponibles.length !== pedidos.size) {
    const validos = new Set(disponibles.map((i) => i.id));
    const faltan = [...pedidos.keys()].filter((id) => !validos.has(id));
    throw httpError(400, 'Hay productos que no están disponibles en este restaurante', faltan.map((id) => ({ campo: 'itemId', mensaje: `El producto ${id} no está disponible` })));
  }
  const lineas = disponibles.map((i) => ({ ...i, cantidad: pedidos.get(i.id) }));

  const usuarioId = req.session.usuario ? req.session.usuario.id : null;
  const pedido = await Pedido.crear({ restauranteId: restaurante.id, usuarioId, mesa, nota, lineas });

  // Se vacía el carrito y se recuerda el pedido en la sesión (para poder cancelarlo sin cuenta).
  if (!items) Carrito.vaciar(req, restaurante.id);
  req.session.pedidos = [...(req.session.pedidos || []), pedido.codigo].slice(-20);

  await Auditoria.desde(req, 'pedido_crear', { entidad: 'pedidos', entidadId: pedido.id, detalle: { codigo: pedido.codigo, total: pedido.total, restauranteId: restaurante.id } });
  res.location(`/api/v1/pedidos/${pedido.codigo}`);
  ok(res, vistaPublica(await Pedido.buscarPorCodigo(pedido.codigo)), { mensaje: `Pedido ${pedido.codigo} recibido` }, 201);
}

// GET /pedidos/:codigo — seguimiento con el código (no expone datos del cliente)
async function seguimiento(req, res) {
  const pedido = await Pedido.buscarPorCodigo(req.valid.params.codigo);
  if (!pedido) throw noEncontrado('Pedido');
  ok(res, vistaPublica(pedido));
}

// POST /pedidos/:codigo/cancelar — solo quien lo hizo y solo si sigue pendiente
async function cancelar(req, res) {
  const pedido = await Pedido.buscarPorCodigo(req.valid.params.codigo);
  if (!pedido) throw noEncontrado('Pedido');

  const esDueno =
    (req.session.usuario && pedido.usuario_id === req.session.usuario.id) ||
    (req.session.pedidos || []).includes(pedido.codigo);
  if (!esDueno) throw httpError(403, 'Solo quien hizo el pedido puede cancelarlo');
  if (pedido.estado !== 'pendiente') throw httpError(409, `No se puede cancelar: el pedido ya está "${pedido.estado}"`);

  const actualizado = await Pedido.cambiarEstado(pedido.id, 'pendiente', 'cancelado');
  if (!actualizado) throw httpError(409, 'El pedido cambió de estado, vuelve a consultarlo');
  await Auditoria.desde(req, 'pedido_cancelar', { entidad: 'pedidos', entidadId: pedido.id, detalle: { codigo: pedido.codigo } });
  ok(res, vistaPublica(await Pedido.buscarPorId(pedido.id)));
}

// GET /mis-pedidos
async function misPedidos(req, res) {
  const q = req.valid.query;
  const filas = await Pedido.listar({ usuarioId: req.session.usuario.id, ...paginacion(q) });
  const { datos, paginacion: pag } = paginado(filas, q);
  ok(res, datos.map(({ usuario_id, usuario, id, ...p }) => p), { paginacion: pag });
}

module.exports = { crear, seguimiento, cancelar, misPedidos, vistaPublica };
