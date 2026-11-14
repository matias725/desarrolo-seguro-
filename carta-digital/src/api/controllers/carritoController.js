// Carrito por API. Comparte la sesión con la web: lo que el cliente agrega
// desde la carta aparece aquí y viceversa.
const Restaurante = require('../../models/restauranteModel');
const Carrito = require('../../services/carritoService');
const { ok, noEncontrado } = require('../../utils/http');

async function restauranteId(req) {
  const r = await Restaurante.buscarPorId(req.valid.params.id);
  if (!r) throw noEncontrado('Restaurante');
  return r.id;
}

async function responder(req, res, id, status = 200) {
  const { lineas, total, cantidad } = await Carrito.detalle(req, id);
  ok(
    res,
    {
      restauranteId: id,
      lineas: lineas.map((l) => ({ itemId: l.id, nombre: l.nombre, precio: l.precio, cantidad: l.cantidad, subtotal: l.subtotal })),
      cantidad,
      total,
      limites: { maxPorProducto: Carrito.MAX_POR_ITEM, maxProductosDistintos: Carrito.MAX_ITEMS_DISTINTOS },
    },
    {},
    status
  );
}

async function ver(req, res) {
  await responder(req, res, await restauranteId(req));
}

async function agregar(req, res) {
  const id = await restauranteId(req);
  await Carrito.agregar(req, id, req.valid.body.itemId, req.valid.body.cantidad);
  await responder(req, res, id);
}

async function cambiarCantidad(req, res) {
  const id = await restauranteId(req);
  await Carrito.fijarCantidad(req, id, req.valid.params.itemId, req.valid.body.cantidad);
  await responder(req, res, id);
}

async function quitar(req, res) {
  const id = await restauranteId(req);
  Carrito.quitar(req, id, req.valid.params.itemId);
  await responder(req, res, id);
}

async function vaciar(req, res) {
  const id = await restauranteId(req);
  Carrito.vaciar(req, id);
  await responder(req, res, id);
}

module.exports = { ver, agregar, cambiarCantidad, quitar, vaciar };
