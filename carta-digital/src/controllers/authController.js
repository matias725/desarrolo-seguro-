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
      avisar(req, 'error', 'Tu cuenta tiene verificación en dos pasos: escribe tu contraseña seguida del código de 6 dígitos de tu app (sin espacios).');
      return res.redirect(volver);
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

// POST /logout  (POST + CSRF: con un GET cualquier sitio podría cerrarte la sesión)
async function logout(req, res) {
  const volver = rutaInternaSegura(req.body.volver);
  await Auth.cerrarSesion(req, res);
  res.redirect(volver);
}

module.exports = { login, logout };
