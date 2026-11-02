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

module.exports = { usuarioEnVistas, requiereLogin };
