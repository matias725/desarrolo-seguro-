// Protección CSRF con "synchronizer token":
// cada sesión tiene un token aleatorio; todo POST debe devolverlo
// (campo oculto _csrf en formularios o cabecera X-CSRF-Token en fetch).
const crypto = require('crypto');

function generarToken(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  return req.session.csrfToken;
}

function iguales(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

function proteccionCsrf(req, res, next) {
  res.locals.csrfToken = generarToken(req);

  const metodosSeguros = ['GET', 'HEAD', 'OPTIONS'];
  if (metodosSeguros.includes(req.method)) return next();

  const enviado = req.get('x-csrf-token') || (req.body && req.body._csrf);
  if (enviado && iguales(enviado, req.session.csrfToken)) return next();

  const err = new Error('Token CSRF inválido o ausente');
  err.status = 403;
  return next(err);
}

module.exports = { proteccionCsrf, generarToken };
