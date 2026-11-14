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
    // Doble factor obligatorio para administradores.
    if (!usuario.totp_activo) {
      return next(
        httpError(403, 'Los administradores deben activar la verificación en dos pasos', [
          { campo: '2fa', mensaje: 'Configúrala con POST /api/v1/auth/2fa/configurar y POST /api/v1/auth/2fa/activar' },
        ])
      );
    }
    if (!req.session.usuario.mfa) {
      return next(
        httpError(403, 'Esta sesión no se inició con verificación en dos pasos', [
          { campo: '2fa', mensaje: 'Cierra sesión e inicia de nuevo usando tu código de 6 dígitos' },
        ])
      );
    }
    req.session.usuario.rol = usuario.rol;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requiereLogin, requiereAdmin };
