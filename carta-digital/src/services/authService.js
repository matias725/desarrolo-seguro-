// Autenticación compartida por el formulario web y la API.
const bcrypt = require('bcryptjs');
const Usuario = require('../models/usuarioModel');
const Auditoria = require('../models/auditoriaModel');

const COSTO_BCRYPT = 12;

// Hash ficticio para comparar aunque el email no exista: así el tiempo de
// respuesta es similar y no se puede adivinar qué emails están registrados.
const HASH_FICTICIO = bcrypt.hashSync('no-es-una-clave-real', COSTO_BCRYPT);

// Devuelve el usuario si las credenciales son correctas y está activo; si no, null.
async function autenticar(req, email, password) {
  const usuario = email && password ? await Usuario.buscarPorEmail(email) : null;
  const passwordOk = await bcrypt.compare(password || '', usuario ? usuario.password_hash : HASH_FICTICIO);

  if (!usuario || !passwordOk || !usuario.activo) {
    await Auditoria.desde(req, 'login_fallido', {
      usuarioId: usuario ? usuario.id : null,
      detalle: { email: typeof email === 'string' ? email.slice(0, 255) : null, motivo: usuario && passwordOk ? 'cuenta_inactiva' : 'credenciales' },
    });
    return null;
  }
  return usuario;
}

// Nueva sesión al autenticarse (evita fijación de sesión).
// Se conserva el carrito que el visitante ya tenía y sus pedidos recientes.
function iniciarSesion(req, usuario) {
  const { carritos, pedidos } = req.session;
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.usuario = { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol || 'cliente' };
      req.session.carritos = carritos;
      req.session.pedidos = pedidos;
      req.session.save(async (err2) => {
        if (err2) return reject(err2);
        await Usuario.registrarLogin(usuario.id);
        await Auditoria.desde(req, 'login_ok', { usuarioId: usuario.id });
        resolve();
      });
    });
  });
}

function cerrarSesion(req, res) {
  const usuarioId = req.session.usuario ? req.session.usuario.id : null;
  return new Promise((resolve, reject) => {
    req.session.destroy(async (err) => {
      if (err) return reject(err);
      res.clearCookie('carta.sid');
      if (usuarioId) await Auditoria.registrar({ usuarioId, accion: 'logout', ip: req.ip });
      resolve();
    });
  });
}

const hashear = (password) => bcrypt.hash(password, COSTO_BCRYPT);
const comparar = (password, hash) => bcrypt.compare(password, hash);

module.exports = { autenticar, iniciarSesion, cerrarSesion, hashear, comparar, COSTO_BCRYPT };
