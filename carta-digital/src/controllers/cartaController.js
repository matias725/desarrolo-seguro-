const Restaurante = require('../models/restauranteModel');
const Carta = require('../models/cartaModel');
const Comentario = require('../models/comentarioModel');
const { parseId } = require('../utils/validacion');
const Carrito = require('../services/carritoService');

function error404() {
  const err = new Error('Restaurante no encontrado');
  err.status = 404;
  return err;
}

// GET /  — listado de restaurantes
async function inicio(req, res) {
  const restaurantes = await Restaurante.listar();
  res.render('inicio', { titulo: 'Carta Digital', restaurantes });
}

// GET /restaurantes/:id  — carta completa del restaurante
async function verCarta(req, res, next) {
  const id = parseId(req.params.id);
  if (!id) return next(error404());

  const restaurante = await Restaurante.buscarPorId(id);
  if (!restaurante) return next(error404());

  const [cartas, destacados, comentarios] = await Promise.all([
    Carta.cartaCompleta(id),
    Carta.destacados(id),
    Comentario.listarPorRestaurante(id),
  ]);

  res.render('carta', {
    titulo: restaurante.nombre,
    restaurante,
    cartas,
    destacados,
    comentarios,
    enCarrito: Carrito.totalItems(req, id),
  });
}

module.exports = { inicio, verCarta };
