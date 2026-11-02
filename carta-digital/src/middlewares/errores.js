const config = require('../config/env');
const formato = require('../utils/formato');

function noEncontrado(req, res, next) {
  const err = new Error('Página no encontrada');
  err.status = 404;
  next(err);
}

// Manejador central de errores: nunca muestra stack traces ni errores de SQL
// al usuario (eso le daría información al atacante). Solo los registra.
// eslint-disable-next-line no-unused-vars
function manejadorErrores(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}:`, config.esProduccion ? err.message : err);
  }

  const mensajes = {
    400: 'Solicitud inválida',
    401: 'Debes iniciar sesión para hacer esto',
    403: 'Solicitud rechazada. Recarga la página e intenta de nuevo.',
    404: 'No encontramos lo que buscas',
    429: 'Demasiados intentos. Espera unos minutos.',
  };
  const mensaje = mensajes[status] || 'Ocurrió un error inesperado';

  res.status(status);
  // Valores por defecto por si el error ocurrió antes de preparar las vistas
  res.locals.csrfToken = res.locals.csrfToken || (req.session && req.session.csrfToken) || '';
  res.locals.usuario = res.locals.usuario || null;
  res.locals.aviso = res.locals.aviso || null;
  res.locals.rutaActual = '/';
  Object.assign(res.locals, formato);
  if (req.accepts(['html', 'json']) === 'json' || req.xhr || req.is('application/json')) {
    return res.json({ ok: false, error: mensaje });
  }
  return res.render('error', { titulo: mensaje, status, mensaje });
}

module.exports = { noEncontrado, manejadorErrores };
