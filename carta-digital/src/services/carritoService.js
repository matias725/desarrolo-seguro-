// Lógica del carrito compartida por la web y la API (usan la misma sesión:
// lo que se agrega desde la carta aparece en la API y viceversa).
// En la sesión solo se guardan { itemId: cantidad }; nombre y precio se leen
// siempre desde la BD, así el cliente no puede manipular precios.
const Carta = require('../models/cartaModel');
const { httpError } = require('../utils/http');

const MAX_POR_ITEM = 20;
const MAX_ITEMS_DISTINTOS = 50;

function carritoDe(req, restauranteId) {
  req.session.carritos = req.session.carritos || {};
  req.session.carritos[restauranteId] = req.session.carritos[restauranteId] || {};
  return req.session.carritos[restauranteId];
}

function totalItems(req, restauranteId) {
  const carrito = (req.session.carritos || {})[restauranteId] || {};
  return Object.values(carrito).reduce((a, b) => a + b, 0);
}

// Devuelve las líneas con precios reales y limpia los platos que ya no están disponibles.
async function detalle(req, restauranteId) {
  const carrito = carritoDe(req, restauranteId);
  const ids = Object.keys(carrito).map(Number);
  const disponibles = new Map((await Carta.itemsDisponibles(ids, restauranteId)).map((i) => [i.id, i]));

  const lineas = [];
  for (const id of ids) {
    const item = disponibles.get(id);
    if (!item) {
      delete carrito[id];
      continue;
    }
    lineas.push({ ...item, cantidad: carrito[id], subtotal: item.precio * carrito[id] });
  }
  const total = lineas.reduce((suma, l) => suma + l.subtotal, 0);
  return { lineas, total, cantidad: lineas.reduce((s, l) => s + l.cantidad, 0) };
}

async function agregar(req, restauranteId, itemId, cantidad = 1) {
  const item = await Carta.itemDisponible(itemId, restauranteId);
  if (!item) throw httpError(400, 'Producto no disponible');

  const carrito = carritoDe(req, restauranteId);
  if (!carrito[itemId] && Object.keys(carrito).length >= MAX_ITEMS_DISTINTOS) {
    throw httpError(400, 'Carrito lleno');
  }
  carrito[itemId] = Math.min((carrito[itemId] || 0) + cantidad, MAX_POR_ITEM);
  return item;
}

// Fija la cantidad exacta (0 = quitar).
async function fijarCantidad(req, restauranteId, itemId, cantidad) {
  const carrito = carritoDe(req, restauranteId);
  if (cantidad === 0) {
    delete carrito[itemId];
    return;
  }
  if (!carrito[itemId]) {
    await agregar(req, restauranteId, itemId, cantidad);
    return;
  }
  carrito[itemId] = Math.min(cantidad, MAX_POR_ITEM);
}

// Quita una unidad (comportamiento del botón "Quitar" de la web).
function quitarUno(req, restauranteId, itemId) {
  const carrito = carritoDe(req, restauranteId);
  if (carrito[itemId] > 1) carrito[itemId] -= 1;
  else delete carrito[itemId];
}

function quitar(req, restauranteId, itemId) {
  delete carritoDe(req, restauranteId)[itemId];
}

function vaciar(req, restauranteId) {
  carritoDe(req, restauranteId);
  req.session.carritos[restauranteId] = {};
}

module.exports = { MAX_POR_ITEM, MAX_ITEMS_DISTINTOS, carritoDe, totalItems, detalle, agregar, fijarCantidad, quitarUno, quitar, vaciar };
