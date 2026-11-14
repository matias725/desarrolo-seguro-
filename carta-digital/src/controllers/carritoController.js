// Carrito de la web (formularios y fetch de public/js/app.js).
// La lógica vive en services/carritoService.js, compartida con la API.
const Restaurante = require('../models/restauranteModel');
const Carrito = require('../services/carritoService');
const { parseId } = require('../utils/validacion');
const { httpError } = require('../utils/http');

async function restauranteValido(req) {
  const id = parseId(req.params.id);
  const restaurante = id && (await Restaurante.buscarPorId(id));
  if (!restaurante) {
    const err = new Error('Restaurante no encontrado');
    err.status = 404;
    throw err;
  }
  return restaurante;
}

// GET /restaurantes/:id/carrito
async function ver(req, res) {
  const restaurante = await restauranteValido(req);
  const { lineas, total } = await Carrito.detalle(req, restaurante.id);
  res.render('carrito', { titulo: `Tu pedido — ${restaurante.nombre}`, restaurante, lineas, total });
}

// POST /restaurantes/:id/carrito   body: { itemId }
async function agregar(req, res) {
  const { id: restauranteId } = await restauranteValido(req);
  const itemId = parseId(req.body.itemId);
  if (!itemId) throw httpError(400, 'Solicitud inválida');

  const item = await Carrito.agregar(req, restauranteId, itemId);
  res.json({ ok: true, producto: item.nombre, enCarrito: Carrito.totalItems(req, restauranteId) });
}

// POST /restaurantes/:id/carrito/eliminar   body: { itemId }
async function eliminar(req, res) {
  const { id: restauranteId } = await restauranteValido(req);
  const itemId = parseId(req.body.itemId);
  if (!itemId) throw httpError(400, 'Solicitud inválida');

  Carrito.quitarUno(req, restauranteId, itemId);
  responder(req, res, restauranteId);
}

// POST /restaurantes/:id/carrito/vaciar
// (el original hacía session_destroy() y cerraba la sesión del usuario)
async function vaciar(req, res) {
  const { id: restauranteId } = await restauranteValido(req);
  Carrito.vaciar(req, restauranteId);
  responder(req, res, restauranteId);
}

function responder(req, res, restauranteId) {
  if (req.is('application/json')) {
    return res.json({ ok: true, enCarrito: Carrito.totalItems(req, restauranteId) });
  }
  res.redirect(`/restaurantes/${restauranteId}/carrito`);
}

module.exports = { ver, agregar, eliminar, vaciar };
