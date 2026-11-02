// Carrito guardado en la sesión del servidor, separado por restaurante.
// En la sesión solo se guardan { itemId: cantidad }; nombre y precio se leen
// siempre desde la BD, así el cliente no puede manipular precios.
const Restaurante = require('../models/restauranteModel');
const Carta = require('../models/cartaModel');
const { parseId } = require('../utils/validacion');

const MAX_POR_ITEM = 20;
const MAX_ITEMS_DISTINTOS = 50;

function carritoDe(req, restauranteId) {
  req.session.carritos = req.session.carritos || {};
  req.session.carritos[restauranteId] = req.session.carritos[restauranteId] || {};
  return req.session.carritos[restauranteId];
}

function totalItemsCarrito(req, restauranteId) {
  const carrito = (req.session.carritos || {})[restauranteId] || {};
  return Object.values(carrito).reduce((a, b) => a + b, 0);
}

function solicitudInvalida(mensaje = 'Solicitud inválida') {
  const err = new Error(mensaje);
  err.status = 400;
  return err;
}

async function restauranteValido(req) {
  const id = parseId(req.params.id);
  if (!id || !(await Restaurante.buscarPorId(id))) {
    const err = new Error('Restaurante no encontrado');
    err.status = 404;
    throw err;
  }
  return id;
}

// GET /restaurantes/:id/carrito
async function ver(req, res) {
  const restauranteId = await restauranteValido(req);
  const restaurante = await Restaurante.buscarPorId(restauranteId);
  const carrito = carritoDe(req, restauranteId);

  const lineas = [];
  for (const [itemId, cantidad] of Object.entries(carrito)) {
    const item = await Carta.itemDisponible(Number(itemId), restauranteId);
    if (!item) {
      delete carrito[itemId]; // el plato ya no está disponible
      continue;
    }
    lineas.push({ ...item, cantidad, subtotal: item.precio * cantidad });
  }
  const total = lineas.reduce((suma, l) => suma + l.subtotal, 0);

  res.render('carrito', { titulo: `Tu pedido — ${restaurante.nombre}`, restaurante, lineas, total });
}

// POST /restaurantes/:id/carrito   body: { itemId }
async function agregar(req, res, next) {
  const restauranteId = await restauranteValido(req);
  const itemId = parseId(req.body.itemId);
  if (!itemId) return next(solicitudInvalida());

  const item = await Carta.itemDisponible(itemId, restauranteId);
  if (!item) return next(solicitudInvalida('Producto no disponible'));

  const carrito = carritoDe(req, restauranteId);
  if (!carrito[itemId] && Object.keys(carrito).length >= MAX_ITEMS_DISTINTOS) {
    return next(solicitudInvalida('Carrito lleno'));
  }
  carrito[itemId] = Math.min((carrito[itemId] || 0) + 1, MAX_POR_ITEM);

  res.json({ ok: true, producto: item.nombre, enCarrito: totalItemsCarrito(req, restauranteId) });
}

// POST /restaurantes/:id/carrito/eliminar   body: { itemId }
async function eliminar(req, res, next) {
  const restauranteId = await restauranteValido(req);
  const itemId = parseId(req.body.itemId);
  if (!itemId) return next(solicitudInvalida());

  const carrito = carritoDe(req, restauranteId);
  if (carrito[itemId] > 1) carrito[itemId] -= 1;
  else delete carrito[itemId];

  responder(req, res, restauranteId);
}

// POST /restaurantes/:id/carrito/vaciar
// (el original hacía session_destroy() y cerraba la sesión del usuario)
async function vaciar(req, res) {
  const restauranteId = await restauranteValido(req);
  carritoDe(req, restauranteId);
  req.session.carritos[restauranteId] = {};
  responder(req, res, restauranteId);
}

function responder(req, res, restauranteId) {
  if (req.is('application/json')) {
    return res.json({ ok: true, enCarrito: totalItemsCarrito(req, restauranteId) });
  }
  res.redirect(`/restaurantes/${restauranteId}/carrito`);
}

module.exports = { ver, agregar, eliminar, vaciar, totalItemsCarrito };
