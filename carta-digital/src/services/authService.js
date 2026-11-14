// Autenticación compartida por el formulario web y la API.
//
// Flujo de login:
//   1. ¿El correo está bloqueado por intentos fallidos?      -> "bloqueado"
//   2. ¿Contraseña correcta y cuenta activa?                  -> si no, suma un fallo
//   3. ¿Tiene 2FA activo?                                     -> pide el código
//   4. Sesión nueva (regenerate), auditoría y alertas
const bcrypt = require('bcryptjs');
const Usuario = require('../models/usuarioModel');
const Auditoria = require('../models/auditoriaModel');
const Bloqueo = require('./bloqueoService');
const Alertas = require('./alertasService');
const Sesiones = require('./sesionesService');
const Correo = require('./correoService');
const { emailValido } = require('../utils/validacion');

const COSTO_BCRYPT = 12;

// Hash ficticio para comparar aunque el email no exista: así el tiempo de
// respuesta es similar y no se puede adivinar qué emails están registrados.
const HASH_FICTICIO = bcrypt.hashSync('no-es-una-clave-real', COSTO_BCRYPT);

// Resultado: { estado: 'ok' | 'invalido' | 'bloqueado', usuario?, hasta? }
async function verificarCredenciales(req, emailRecibido, password) {
  const email = emailValido(emailRecibido);
  const pass = typeof password === 'string' && password.length <= 128 ? password : '';

  const [usuario, bloqueo] = email ? await Promise.all([Usuario.buscarPorEmail(email), Bloqueo.estado(email)]) : [null, { bloqueado: false }];
  // Siempre se ejecuta bcrypt (mismo tiempo de respuesta en todos los casos).
  const passwordOk = await bcrypt.compare(pass, usuario ? usuario.password_hash : HASH_FICTICIO);

  if (bloqueo.bloqueado) {
    await Auditoria.desde(req, 'login_bloqueado', { usuarioId: usuario ? usuario.id : null, detalle: { email } });
    return { estado: 'bloqueado', hasta: bloqueo.hasta };
  }

  if (!usuario || !passwordOk || !usuario.activo || !pass) {
    await Auditoria.desde(req, 'login_fallido', {
      usuarioId: usuario ? usuario.id : null,
      detalle: { email: email || (typeof emailRecibido === 'string' ? emailRecibido.slice(0, 255) : null), motivo: usuario && passwordOk ? 'cuenta_inactiva' : 'credenciales' },
    });
    const resultado = email ? await Bloqueo.registrarFallo(email, req.ip) : null;
    await Alertas.trasLoginFallido(req, { email, usuario, bloqueo: resultado });
    if (resultado && resultado.recienBloqueado) return { estado: 'bloqueado', hasta: resultado.hasta };
    return { estado: 'invalido' };
  }

  await Bloqueo.limpiar(email);
  return { estado: 'ok', usuario };
}

// Paso intermedio del 2FA: se recuerda en la sesión quién pasó la contraseña
// (máx. 5 minutos y 5 intentos de código).
function iniciarPendiente2fa(req, usuario) {
  req.session.pendiente2fa = { usuarioId: usuario.id, expira: Date.now() + 5 * 60 * 1000, intentos: 0 };
}

function leerPendiente2fa(req) {
  const p = req.session.pendiente2fa;
  if (!p || p.expira < Date.now()) {
    delete req.session.pendiente2fa;
    return null;
  }
  return p;
}

// Nueva sesión al autenticarse (evita fijación de sesión).
// Se conserva el carrito que el visitante ya tenía y sus pedidos recientes.
async function iniciarSesion(req, usuario, { mfa = false, metodo = 'password' } = {}) {
  await Alertas.trasLoginCorrecto(req, usuario);
  const { carritos, pedidos } = req.session;
  await new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.usuario = { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol || 'cliente', mfa };
      req.session.meta = { ip: req.ip, agente: String(req.get('user-agent') || '').slice(0, 200), creada: new Date().toISOString() };
      req.session.carritos = carritos;
      req.session.pedidos = pedidos;
      req.session.save((err2) => (err2 ? reject(err2) : resolve()));
    });
  });
  await Usuario.registrarLogin(usuario.id);
  await Auditoria.desde(req, 'login_ok', { usuarioId: usuario.id, detalle: { metodo, mfa } });
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

// Tras cambiar la contraseña: cierra las otras sesiones y avisa por correo.
async function trasCambioPassword(req, usuario, { motivo }) {
  const cerradas = await Sesiones.cerrarTodas(usuario.id, req.sessionID);
  Correo.enviar({
    para: usuario.email,
    asunto: 'Tu contraseña fue cambiada',
    titulo: 'Cambiamos tu contraseña',
    parrafos: [
      `Hola ${usuario.nombre}: la contraseña de tu cuenta se cambió (${motivo}) desde la IP ${req.ip}.`,
      `Por seguridad cerramos ${cerradas} sesión(es) abiertas en otros dispositivos.`,
      'Si no fuiste tú, recupera tu cuenta de inmediato con "olvidé mi contraseña".',
    ],
  });
  return cerradas;
}

const hashear = (password) => bcrypt.hash(password, COSTO_BCRYPT);
const comparar = (password, hash) => bcrypt.compare(password, hash);

module.exports = {
  verificarCredenciales,
  iniciarPendiente2fa,
  leerPendiente2fa,
  iniciarSesion,
  cerrarSesion,
  trasCambioPassword,
  hashear,
  comparar,
  COSTO_BCRYPT,
};
