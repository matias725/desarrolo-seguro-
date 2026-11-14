const Auth = require('../../services/authService');
const Usuario = require('../../models/usuarioModel');
const Auditoria = require('../../models/auditoriaModel');
const { generarToken } = require('../../middlewares/csrf');
const { ok, httpError } = require('../../utils/http');

const publico = (u) => ({ id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, creado: u.creado, ultimoLogin: u.ultimo_login });

// GET /auth/csrf — token para enviar en la cabecera X-CSRF-Token
function csrf(req, res) {
  ok(res, { csrfToken: generarToken(req), cabecera: 'X-CSRF-Token' });
}

async function registro(req, res) {
  const { nombre, email, password } = req.valid.body;
  if (password.toLowerCase().includes(email.split('@')[0])) {
    throw httpError(400, 'Datos inválidos', [{ campo: 'password', mensaje: 'La contraseña no puede contener tu correo' }]);
  }
  let usuario;
  try {
    usuario = await Usuario.crear({ nombre, email, passwordHash: await Auth.hashear(password) });
  } catch (err) {
    if (err.code === '23505') throw httpError(409, 'Ya existe una cuenta con ese correo');
    throw err;
  }
  await Auditoria.desde(req, 'registro', { usuarioId: usuario.id, entidad: 'usuarios', entidadId: usuario.id });
  await Auth.iniciarSesion(req, usuario);
  ok(res, { usuario: publico(usuario), csrfToken: generarToken(req) }, {}, 201);
}

async function login(req, res) {
  const { email, password } = req.valid.body;
  const usuario = await Auth.autenticar(req, email.trim().toLowerCase(), password);
  if (!usuario) throw httpError(401, 'Correo o contraseña incorrectos');
  await Auth.iniciarSesion(req, usuario);
  // La sesión cambió: el token CSRF anterior ya no sirve, se entrega el nuevo.
  ok(res, { usuario: publico(await Usuario.buscarPorId(usuario.id)), csrfToken: generarToken(req) });
}

async function logout(req, res) {
  await Auth.cerrarSesion(req, res);
  ok(res, { mensaje: 'Sesión cerrada' });
}

async function yo(req, res) {
  const usuario = await Usuario.buscarPorId(req.session.usuario.id);
  if (!usuario || !usuario.activo) throw httpError(401, 'Debes iniciar sesión');
  ok(res, publico(usuario));
}

async function cambiarPassword(req, res) {
  const { passwordActual, passwordNueva } = req.valid.body;
  const id = req.session.usuario.id;
  const hash = await Usuario.hashDe(id);
  if (!hash || !(await Auth.comparar(passwordActual, hash))) {
    await Auditoria.desde(req, 'cambio_password_fallido', { entidad: 'usuarios', entidadId: id });
    throw httpError(400, 'La contraseña actual no es correcta');
  }
  await Usuario.cambiarPassword(id, await Auth.hashear(passwordNueva));
  await Auditoria.desde(req, 'cambio_password', { entidad: 'usuarios', entidadId: id });
  // Se renueva la sesión tras cambiar la clave.
  await Auth.iniciarSesion(req, await Usuario.buscarPorId(id));
  ok(res, { mensaje: 'Contraseña actualizada', csrfToken: generarToken(req) });
}

module.exports = { csrf, registro, login, logout, yo, cambiarPassword };
