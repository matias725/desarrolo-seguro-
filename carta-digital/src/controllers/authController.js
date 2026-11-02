const bcrypt = require('bcryptjs');
const Usuario = require('../models/usuarioModel');
const { emailValido, textoValido, rutaInternaSegura } = require('../utils/validacion');

// Hash ficticio para comparar aunque el email no exista: así el tiempo de
// respuesta es similar y no se puede adivinar qué emails están registrados.
const HASH_FICTICIO = bcrypt.hashSync('no-es-una-clave-real', 12);

// POST /login
async function login(req, res, next) {
  const volver = rutaInternaSegura(req.body.volver);
  const email = emailValido(req.body.email);
  const password = textoValido(req.body.password, { min: 1, max: 128 });

  const usuario = email && password ? await Usuario.buscarPorEmail(email) : null;
  const passwordOk = await bcrypt.compare(password || '', usuario ? usuario.password_hash : HASH_FICTICIO);

  if (!usuario || !passwordOk || !usuario.activo) {
    // Mensaje genérico: no revela si falló el email o la contraseña.
    req.session.aviso = { tipo: 'error', texto: 'Correo o contraseña incorrectos.' };
    return res.redirect(volver);
  }

  // Nueva sesión al autenticarse (evita fijación de sesión).
  // Se conserva el carrito que el visitante ya tenía.
  const carritos = req.session.carritos;
  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.usuario = { id: usuario.id, nombre: usuario.nombre };
    req.session.carritos = carritos;
    req.session.aviso = { tipo: 'ok', texto: `Bienvenido/a, ${usuario.nombre}.` };
    req.session.save((err2) => (err2 ? next(err2) : res.redirect(volver)));
  });
}

// POST /logout  (POST + CSRF: con un GET cualquier sitio podría cerrarte la sesión)
function logout(req, res, next) {
  const volver = rutaInternaSegura(req.body.volver);
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('carta.sid');
    res.redirect(volver);
  });
}

module.exports = { login, logout };
