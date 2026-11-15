// Login del formulario web (src/views/partials/head.ejs, que NO se modificó).
// Para cuentas con verificación en dos pasos, como el formulario solo tiene
// "Correo" y "Contraseña", se escribe la contraseña seguida del código de 6
// dígitos de la app (ej: MiClave2026 + 123456 -> "MiClave2026123456").
const Auth = require('../services/authService');
const Totp = require('../services/totpService');
const Bloqueo = require('../services/bloqueoService');
const Alertas = require('../services/alertasService');
const Usuario = require('../models/usuarioModel');
const Auditoria = require('../models/auditoriaModel');
const { emailValido, rutaInternaSegura } = require('../utils/validacion');

const avisar = (req, tipo, texto) => {
  req.session.aviso = { tipo, texto };
};

// POST /login
async function login(req, res) {
  const volver = rutaInternaSegura(req.body.volver);
  const email = emailValido(req.body.email);
  let password = typeof req.body.password === 'string' ? req.body.password : '';
  let codigo = null;

  // Si la cuenta usa 2FA, los últimos 6 dígitos son el código.
  if (email && password) {
    const cuenta = await Usuario.buscarPorEmail(email);
    const partes = cuenta && cuenta.totp_activo ? /^(.+?)(\d{6})$/.exec(password) : null;
    if (partes) [, password, codigo] = partes;
  }

  const r = await Auth.verificarCredenciales(req, req.body.email, password);
  if (r.estado === 'bloqueado') {
    avisar(req, 'error', 'Demasiados intentos fallidos. Por seguridad la cuenta quedó bloqueada 15 minutos.');
    return res.redirect(volver);
  }
  if (r.estado !== 'ok') {
    // Mensaje genérico: no revela si falló el email o la contraseña.
    avisar(req, 'error', 'Correo o contraseña incorrectos.');
    return res.redirect(volver);
  }

  const { usuario } = r;
  let mfa = false;
  if (usuario.totp_activo) {
    if (!codigo) {
      // Segundo paso en su propia página (/verificar). La sesión recuerda
      // quién pasó la contraseña durante 5 minutos.
      Auth.iniciarPendiente2fa(req, usuario);
      await Auditoria.desde(req, 'login_password_ok_espera_2fa', { usuarioId: usuario.id, detalle: { origen: 'web' } });
      return res.redirect(`/verificar?volver=${encodeURIComponent(volver)}`);
    }
    const v = await Totp.verificar(usuario.id, codigo);
    if (!v.ok) {
      await Auditoria.desde(req, '2fa_fallido', { usuarioId: usuario.id, detalle: { origen: 'web' } });
      const b = await Bloqueo.registrarFallo(usuario.email, req.ip);
      if (b.recienBloqueado) await Alertas.trasFallos2fa(req, usuario);
      avisar(req, 'error', v.reutilizado ? 'Ese código ya se usó: espera el siguiente.' : 'Código de verificación incorrecto.');
      return res.redirect(volver);
    }
    mfa = true;
  }

  await Auth.iniciarSesion(req, usuario, { mfa, metodo: mfa ? 'web_2fa' : 'web' });
  avisar(req, 'ok', `Bienvenido/a, ${usuario.nombre}.`);
  res.redirect(volver);
}

// GET /ingresar — página de inicio de sesión (además del menú de la barra)
function paginaIngresar(req, res) {
  if (req.session.usuario) return res.redirect('/');
  res.render('ingresar', { titulo: 'Iniciar sesión', volver: rutaInternaSegura(req.query.volver) });
}

// GET /verificar — paso 2 del login con verificación en dos pasos
function paginaVerificar(req, res) {
  if (!Auth.leerPendiente2fa(req)) {
    avisar(req, 'error', 'Tu inicio de sesión venció: vuelve a escribir tu contraseña.');
    return res.redirect('/ingresar');
  }
  res.render('verificar', { titulo: 'Verificación en dos pasos', volver: rutaInternaSegura(req.query.volver) });
}

// POST /verificar  body: { codigo, volver }
async function verificar(req, res) {
  const volver = rutaInternaSegura(req.body.volver);
  const pendiente = Auth.leerPendiente2fa(req);
  if (!pendiente) {
    avisar(req, 'error', 'Tu inicio de sesión venció: vuelve a escribir tu contraseña.');
    return res.redirect('/ingresar');
  }
  const reintentar = () => res.redirect(`/verificar?volver=${encodeURIComponent(volver)}`);
  const codigo = typeof req.body.codigo === 'string' ? req.body.codigo.trim().replace(/\s+/g, '') : '';
  if (!/^(\d{6}|[A-Za-z0-9]{4}-?[A-Za-z0-9]{4})$/.test(codigo)) {
    avisar(req, 'error', 'Escribe el código de 6 dígitos de tu app o un código de respaldo (XXXX-XXXX).');
    return reintentar();
  }

  const usuario = await Usuario.buscarPorId(pendiente.usuarioId);
  if (!usuario || !usuario.activo || (await Bloqueo.estado(usuario.email)).bloqueado) {
    delete req.session.pendiente2fa;
    avisar(req, 'error', 'No se pudo iniciar sesión. Si fallaste varias veces, la cuenta quedó bloqueada 15 minutos.');
    return res.redirect('/ingresar');
  }

  const v = await Totp.verificar(usuario.id, codigo);
  if (!v.ok) {
    pendiente.intentos += 1;
    await Auditoria.desde(req, '2fa_fallido', { usuarioId: usuario.id, detalle: { origen: 'web', reutilizado: Boolean(v.reutilizado) } });
    const b = await Bloqueo.registrarFallo(usuario.email, req.ip);
    if (b.recienBloqueado || pendiente.intentos >= 5) {
      delete req.session.pendiente2fa;
      await Alertas.trasFallos2fa(req, usuario);
      avisar(req, 'error', b.recienBloqueado ? 'Demasiados intentos fallidos: la cuenta quedó bloqueada 15 minutos.' : 'Demasiados códigos incorrectos: vuelve a iniciar sesión.');
      return res.redirect('/ingresar');
    }
    avisar(req, 'error', v.reutilizado ? 'Ese código ya se usó: espera el siguiente.' : 'Código incorrecto.');
    return reintentar();
  }

  delete req.session.pendiente2fa;
  await Bloqueo.limpiar(usuario.email);
  await Auth.iniciarSesion(req, usuario, { mfa: true, metodo: v.metodo === 'respaldo' ? 'web_2fa_respaldo' : 'web_2fa' });
  avisar(req, 'ok', v.metodo === 'respaldo' ? `Bienvenido/a, ${usuario.nombre}. Usaste un código de respaldo: te quedan ${v.restantes}.` : `Bienvenido/a, ${usuario.nombre}.`);
  res.redirect(volver);
}

// POST /logout  (POST + CSRF: con un GET cualquier sitio podría cerrarte la sesión)
async function logout(req, res) {
  const volver = rutaInternaSegura(req.body.volver);
  await Auth.cerrarSesion(req, res);
  res.redirect(volver);
}

module.exports = { login, logout, paginaIngresar, paginaVerificar, verificar };
