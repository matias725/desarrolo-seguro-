const Restaurante = require('../models/restauranteModel');
const Comentario = require('../models/comentarioModel');
const { parseId, textoValido } = require('../utils/validacion');

// POST /restaurantes/:id/comentarios  (requiere login + CSRF)
// El autor se toma de la sesión, no del formulario: en el original
// cualquiera podía comentar haciéndose pasar por otro usuario.
async function crear(req, res, next) {
  const restauranteId = parseId(req.params.id);
  if (!restauranteId || !(await Restaurante.buscarPorId(restauranteId))) {
    const err = new Error('Restaurante no encontrado');
    err.status = 404;
    return next(err);
  }

  const comentario = textoValido(req.body.comentario, { min: 2, max: 1000 });
  if (!comentario) {
    req.session.aviso = { tipo: 'error', texto: 'El comentario debe tener entre 2 y 1000 caracteres.' };
    return res.redirect(`/restaurantes/${restauranteId}#comentarios`);
  }

  await Comentario.crear({ comentario, usuarioId: req.session.usuario.id, restauranteId });
  req.session.aviso = { tipo: 'ok', texto: '¡Gracias por tu comentario!' };
  res.redirect(`/restaurantes/${restauranteId}#comentarios`);
}

module.exports = { crear };
