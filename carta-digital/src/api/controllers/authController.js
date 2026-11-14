const Auth = require('../../services/authService');
const Totp = require('../../services/totpService');
const Bloqueo = require('../../services/bloqueoService');
const Alertas = require('../../services/alertasService');
const Sesiones = require('../../services/sesionesService');
const Recuperacion = require('../../services/recuperacionService');
const Correo = require('../../services/correoService');
const Usuario = require('../../models/usuarioModel');
const Auditoria = require('../../models/auditoriaModel');
const { generarToken } = require('../../middlewares/csrf');
const { ok, httpError } = require('../../utils/http');

const publico = (u) => ({
  id: u.id,
  nombre: u.nombre,
  email: u.email,
  rol: u.rol,
  dosPasos: Boolean(u.totp_activo),
  creado: u.creado,
  ultimoLogin: u.ultimo_login,
});

const MENSAJE_BLOQUEO = 'Demasiados intentos fallidos: esta cuenta quedó bloqueada 15 minutos. Espera o recupera tu contraseña.';

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
  const r = await Auth.verificarCredenciales(req, email, password);
  if (r.estado === 'bloqueado') throw httpError(423, MENSAJE_BLOQUEO);
  if (r.estado !== 'ok') throw httpError(401, 'Correo o contraseña incorrectos');

  // Con 2FA: la contraseña sola no basta, se pide el código.
  if (r.usuario.totp_activo) {
    Auth.iniciarPendiente2fa(req, r.usuario);
    await Auditoria.desde(req, 'login_password_ok_espera_2fa', { usuarioId: r.usuario.id });
    return ok(res, {
      requiere2fa: true,
      mensaje: 'Contraseña correcta. Envía el código de tu app de autenticación a POST /auth/2fa/verificar (vence en 5 minutos).',
      csrfToken: generarToken(req),
    });
  }

  await Auth.iniciarSesion(req, r.usuario);
  const usuario = await Usuario.buscarPorId(r.usuario.id);
  // La sesión cambió: el token CSRF anterior ya no sirve, se entrega el nuevo.
  ok(res, {
    usuario: publico(usuario),
    csrfToken: generarToken(req),
    ...(usuario.rol === 'admin' ? { aviso: 'Los administradores deben activar la verificación en dos pasos para usar /admin (POST /auth/2fa/configurar).' } : {}),
  });
}

// POST /auth/2fa/verificar — segundo paso del login
async function verificar2fa(req, res) {
  const pendiente = Auth.leerPendiente2fa(req);
  if (!pendiente) throw httpError(400, 'No hay un inicio de sesión pendiente (o venció): vuelve a enviar tu contraseña');

  const usuario = await Usuario.buscarPorId(pendiente.usuarioId);
  if (!usuario || !usuario.activo) {
    delete req.session.pendiente2fa;
    throw httpError(401, 'Correo o contraseña incorrectos');
  }
  if ((await Bloqueo.estado(usuario.email)).bloqueado) {
    delete req.session.pendiente2fa;
    throw httpError(423, MENSAJE_BLOQUEO);
  }

  const v = await Totp.verificar(usuario.id, req.valid.body.codigo);
  if (!v.ok) {
    pendiente.intentos += 1;
    await Auditoria.desde(req, '2fa_fallido', { usuarioId: usuario.id, detalle: { reutilizado: Boolean(v.reutilizado) } });
    // Los códigos incorrectos cuentan para el bloqueo de la cuenta.
    const b = await Bloqueo.registrarFallo(usuario.email, req.ip);
    if (b.recienBloqueado || pendiente.intentos >= 5) {
      delete req.session.pendiente2fa;
      await Alertas.trasFallos2fa(req, usuario);
      if (b.recienBloqueado) throw httpError(423, MENSAJE_BLOQUEO);
      throw httpError(401, 'Demasiados códigos incorrectos: vuelve a iniciar sesión');
    }
    throw httpError(401, v.reutilizado ? 'Ese código ya se usó: espera el siguiente' : 'Código incorrecto');
  }

  delete req.session.pendiente2fa;
  await Bloqueo.limpiar(usuario.email);
  await Auth.iniciarSesion(req, usuario, { mfa: true, metodo: v.metodo === 'respaldo' ? '2fa_respaldo' : '2fa_app' });
  ok(res, {
    usuario: publico(usuario),
    csrfToken: generarToken(req),
    ...(v.metodo === 'respaldo' ? { aviso: `Usaste un código de respaldo. Te quedan ${v.restantes}.` } : {}),
  });
}

// POST /auth/2fa/configurar — genera el secreto y el código QR
async function configurar2fa(req, res) {
  const usuario = await Usuario.buscarPorId(req.session.usuario.id);
  if (usuario.totp_activo) throw httpError(409, 'La verificación en dos pasos ya está activa');
  const datos = await Totp.configurar(usuario);
  await Auditoria.desde(req, '2fa_configuracion_iniciada', { entidad: 'usuarios', entidadId: usuario.id });
  ok(res, {
    ...datos,
    pasos: [
      'Escanea el código QR (campo "qr": ábrelo en el navegador) con Google Authenticator, Microsoft Authenticator o Authy.',
      'Si no puedes escanear, escribe el "secreto" a mano en la app.',
      'Confirma con POST /auth/2fa/activar { "codigo": "123456", "password": "tu contraseña" }.',
    ],
  });
}

// POST /auth/2fa/activar — confirma con un código y la contraseña
async function activar2fa(req, res) {
  const { codigo, password } = req.valid.body;
  const id = req.session.usuario.id;
  if (!(await Auth.comparar(password, await Usuario.hashDe(id)))) throw httpError(400, 'Contraseña incorrecta');
  const r = await Totp.activar(id, codigo);
  if (!r.ok) throw httpError(400, r.motivo);

  req.session.usuario.mfa = true; // ya demostró tener el dispositivo
  const usuario = await Usuario.buscarPorId(id);
  await Auditoria.desde(req, '2fa_activado', { entidad: 'usuarios', entidadId: id });
  Correo.enviar({
    para: usuario.email,
    asunto: 'Activaste la verificación en dos pasos',
    titulo: 'Verificación en dos pasos activada',
    parrafos: [`Hola ${usuario.nombre}: desde ahora te pediremos un código de tu app cada vez que inicies sesión.`, 'Guarda tus códigos de respaldo en un lugar seguro.'],
  });
  ok(res, {
    activo: true,
    codigosRespaldo: r.codigosRespaldo,
    aviso: 'Guarda estos códigos de respaldo AHORA: no se volverán a mostrar. Cada uno sirve una sola vez si pierdes el teléfono.',
  });
}

// POST /auth/2fa/desactivar — requiere contraseña + código (los admins no pueden)
async function desactivar2fa(req, res) {
  const { codigo, password } = req.valid.body;
  const usuario = await Usuario.buscarPorId(req.session.usuario.id);
  if (!usuario.totp_activo) throw httpError(409, 'La verificación en dos pasos no está activa');
  if (usuario.rol === 'admin') throw httpError(409, 'Los administradores deben mantener la verificación en dos pasos');
  if (!(await Auth.comparar(password, await Usuario.hashDe(usuario.id)))) throw httpError(400, 'Contraseña incorrecta');
  if (!(await Totp.verificar(usuario.id, codigo)).ok) throw httpError(400, 'Código incorrecto');

  await Usuario.desactivarTotp(usuario.id);
  req.session.usuario.mfa = false;
  await Auditoria.desde(req, '2fa_desactivado', { entidad: 'usuarios', entidadId: usuario.id });
  Correo.enviar({
    para: usuario.email,
    asunto: 'Desactivaste la verificación en dos pasos',
    titulo: 'Verificación en dos pasos desactivada',
    parrafos: [`Hola ${usuario.nombre}: tu cuenta ya no pide código al iniciar sesión (IP ${req.ip}).`, 'Si no fuiste tú, cambia tu contraseña de inmediato.'],
  });
  ok(res, { activo: false });
}

// POST /auth/2fa/respaldo — nuevos códigos de respaldo (invalida los anteriores)
async function regenerarRespaldo(req, res) {
  const id = req.session.usuario.id;
  const u = await Usuario.buscarPorId(id);
  if (!u.totp_activo) throw httpError(409, 'La verificación en dos pasos no está activa');
  if (!(await Totp.verificar(id, req.valid.body.codigo)).ok) throw httpError(400, 'Código incorrecto');
  const { codigos, hashes } = Totp.generarRespaldo();
  await Usuario.regenerarRespaldo(id, hashes);
  await Auditoria.desde(req, '2fa_respaldo_regenerado', { entidad: 'usuarios', entidadId: id });
  ok(res, { codigosRespaldo: codigos, aviso: 'Los códigos anteriores ya no sirven.' });
}

async function logout(req, res) {
  await Auth.cerrarSesion(req, res);
  ok(res, { mensaje: 'Sesión cerrada' });
}

async function yo(req, res) {
  const usuario = await Usuario.buscarPorId(req.session.usuario.id);
  if (!usuario || !usuario.activo) throw httpError(401, 'Debes iniciar sesión');
  ok(res, { ...publico(usuario), sesionCon2fa: Boolean(req.session.usuario.mfa) });
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
  const usuario = await Usuario.buscarPorId(id);
  const mfa = Boolean(req.session.usuario.mfa);
  // Se renueva la sesión y se cierran las de otros dispositivos.
  await Auth.iniciarSesion(req, usuario, { mfa, metodo: 'cambio_password' });
  const cerradas = await Auth.trasCambioPassword(req, usuario, { motivo: 'desde tu cuenta' });
  ok(res, { mensaje: 'Contraseña actualizada', sesionesCerradas: cerradas, csrfToken: generarToken(req) });
}

// ---- Recuperación de contraseña
async function olvidePassword(req, res) {
  await Recuperacion.solicitar(req, req.valid.body.email);
  // Misma respuesta exista o no la cuenta (anti enumeración).
  ok(res, { mensaje: 'Si el correo está registrado, te enviamos un código para restablecer tu contraseña. Revisa tu bandeja (vence en 15 minutos).' });
}

async function restablecerPassword(req, res) {
  const r = await Recuperacion.restablecer(req, { ...req.valid.body, hashear: Auth.hashear });
  if (!r.ok) throw httpError(400, r.motivo, r.requiere2fa ? [{ campo: 'codigo2fa', mensaje: r.motivo }] : undefined);
  ok(res, { mensaje: 'Contraseña restablecida. Inicia sesión con tu nueva contraseña.', sesionesCerradas: r.sesionesCerradas });
}

// ---- Sesiones
async function listarSesiones(req, res) {
  ok(res, await Sesiones.listar(req.session.usuario.id, req.sessionID));
}

async function cerrarTodasSesiones(req, res) {
  const { incluirActual } = req.valid.body;
  const id = req.session.usuario.id;
  const cerradas = await Sesiones.cerrarTodas(id, incluirActual ? null : req.sessionID);
  await Auditoria.desde(req, 'sesiones_cerradas', { usuarioId: id, detalle: { cerradas, incluirActual } });
  if (incluirActual) {
    res.clearCookie('carta.sid');
    req.session.destroy(() => {});
    return ok(res, { cerradas: cerradas, mensaje: 'Se cerraron todas tus sesiones, incluida esta.' });
  }
  ok(res, { cerradas, mensaje: `Se cerraron ${cerradas} sesión(es) en otros dispositivos.` });
}

async function cerrarSesionPorId(req, res) {
  const id = req.session.usuario.id;
  const sid = await Sesiones.cerrarUna(id, req.valid.params.id);
  if (!sid) throw httpError(404, 'Sesión no encontrada');
  await Auditoria.desde(req, 'sesion_cerrada', { usuarioId: id });
  if (sid === req.sessionID) {
    res.clearCookie('carta.sid');
    req.session.destroy(() => {});
  }
  ok(res, { cerrada: true, eraLaActual: sid === req.sessionID });
}

module.exports = {
  csrf,
  registro,
  login,
  verificar2fa,
  configurar2fa,
  activar2fa,
  desactivar2fa,
  regenerarRespaldo,
  logout,
  yo,
  cambiarPassword,
  olvidePassword,
  restablecerPassword,
  listarSesiones,
  cerrarTodasSesiones,
  cerrarSesionPorId,
};
