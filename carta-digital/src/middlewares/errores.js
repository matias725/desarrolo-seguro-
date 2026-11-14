const config = require('../config/env');
const formato = require('../utils/formato');

function noEncontrado(req, res, next) {
  const err = new Error('Página no encontrada');
  err.status = 404;
  next(err);
}

const MENSAJES = {
  400: 'Solicitud inválida',
  401: 'Debes iniciar sesión para hacer esto',
  403: 'Solicitud rechazada. Recarga la página e intenta de nuevo.',
  404: 'No encontramos lo que buscas',
  409: 'La operación no se puede realizar en el estado actual',
  413: 'La solicitud es demasiado grande',
  415: 'Formato de solicitud no soportado',
  429: 'Demasiados intentos. Espera unos minutos.',
};

// Manejador central de errores: nunca muestra stack traces ni errores de SQL
// al usuario (eso le daría información al atacante). Solo los registra.
// - Errores creados con httpError() (expose = true) muestran su mensaje.
// - Cualquier otro error muestra un mensaje genérico según el código.
// eslint-disable-next-line no-unused-vars
function manejadorErrores(err, req, res, next) {
  let status = err.status || err.statusCode || 500;
  if (status < 400 || status > 599) status = 500;

  if (status >= 500) {
    (req.log || console).error({ err: config.esProduccion ? { message: err.message } : err }, `error en ${req.method} ${req.originalUrl}`);
  }

  const mensaje = (err.expose && status < 500 && err.message) || MENSAJES[status] || 'Ocurrió un error inesperado';

  res.status(status);
  const esApi = req.originalUrl.startsWith('/api/');
  if (esApi || req.accepts(['html', 'json']) === 'json' || req.xhr || req.is('application/json')) {
    const cuerpo = { ok: false, error: mensaje };
    if (err.detalles && status < 500) cuerpo.detalles = err.detalles;
    if (status >= 500 && req.id) cuerpo.requestId = req.id; // para buscar el error en los logs
    return res.json(cuerpo);
  }

  // Valores por defecto por si el error ocurrió antes de preparar las vistas
  res.locals.csrfToken = res.locals.csrfToken || (req.session && req.session.csrfToken) || '';
  res.locals.usuario = res.locals.usuario || null;
  res.locals.aviso = res.locals.aviso || null;
  res.locals.rutaActual = '/';
  Object.assign(res.locals, formato);
  // En las páginas web se mantienen los mensajes genéricos de siempre.
  return res.render('error', { titulo: MENSAJES[status] || mensaje, status, mensaje: MENSAJES[status] || mensaje });
}

module.exports = { noEncontrado, manejadorErrores };
