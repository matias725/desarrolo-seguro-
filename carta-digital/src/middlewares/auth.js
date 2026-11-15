// Deja el usuario de la sesión disponible en las vistas.
function usuarioEnVistas(req, res, next) {
  res.locals.usuario = req.session.usuario || null;
  next();
}

// Exige sesión iniciada (control de acceso del lado del servidor).
function requiereLogin(req, res, next) {
  if (req.session.usuario) return next();
  const err = new Error('Debes iniciar sesión');
  err.status = 401;
  return next(err);
}

// Páginas web que requieren cuenta: en vez de un error, lleva a /ingresar
// y vuelve a la página después del login.
function requiereLoginWeb(req, res, next) {
  if (req.session.usuario) return next();
  req.session.aviso = { tipo: 'error', texto: 'Inicia sesión para ver esta página.' };
  return res.redirect(`/ingresar?volver=${encodeURIComponent(req.path)}`);
}

module.exports = { usuarioEnVistas, requiereLogin, requiereLoginWeb };
