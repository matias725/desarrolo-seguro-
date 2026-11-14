const Auth = require('../services/authService');
const { emailValido, textoValido, rutaInternaSegura } = require('../utils/validacion');

// POST /login
async function login(req, res) {
  const volver = rutaInternaSegura(req.body.volver);
  const email = emailValido(req.body.email);
  const password = textoValido(req.body.password, { min: 1, max: 128 });

  const usuario = await Auth.autenticar(req, email, password);
  if (!usuario) {
    // Mensaje genérico: no revela si falló el email o la contraseña.
    req.session.aviso = { tipo: 'error', texto: 'Correo o contraseña incorrectos.' };
    return res.redirect(volver);
  }

  await Auth.iniciarSesion(req, usuario);
  req.session.aviso = { tipo: 'ok', texto: `Bienvenido/a, ${usuario.nombre}.` };
  res.redirect(volver);
}

// POST /logout  (POST + CSRF: con un GET cualquier sitio podría cerrarte la sesión)
async function logout(req, res) {
  const volver = rutaInternaSegura(req.body.volver);
  await Auth.cerrarSesion(req, res);
  res.redirect(volver);
}

module.exports = { login, logout };
