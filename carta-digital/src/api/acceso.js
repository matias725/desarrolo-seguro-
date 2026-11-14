// Control de acceso de la API.
const Usuario = require('../models/usuarioModel');
const { httpError } = require('../utils/http');

function requiereLogin(req, res, next) {
  if (req.session.usuario) return next();
  return next(httpError(401, 'Debes iniciar sesión'));
}

// El rol se vuelve a leer desde la BD en cada petición de admin: si a alguien
// le quitan el rol o desactivan su cuenta, pierde el acceso al instante
// (no basta con lo que quedó guardado en su sesión).
async function requiereAdmin(req, res, next) {
  try {
    if (!req.session.usuario) return next(httpError(401, 'Debes iniciar sesión'));
    const usuario = await Usuario.buscarPorId(req.session.usuario.id);
    if (!usuario || !usuario.activo || usuario.rol !== 'admin') {
      return next(httpError(403, 'Necesitas permisos de administrador'));
    }
    req.session.usuario.rol = usuario.rol;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requiereLogin, requiereAdmin };
