// Recuperación de contraseña por correo.
// Trampas clásicas y cómo se evitan:
//   1. Enumeración de usuarios -> misma respuesta exista o no el correo, y el
//      correo se envía en segundo plano (mismo tiempo de respuesta).
//   2. Token adivinable       -> 32 bytes aleatorios (crypto.randomBytes).
//   3. Robo de la BD           -> se guarda solo el SHA-256 del token.
//   4. Token eterno/reusable   -> vence en 15 min, un solo uso, y pedir uno
//                                 nuevo invalida los anteriores.
//   5. Host header injection   -> el enlace usa APP_URL (configuración), nunca
//                                 la cabecera Host de la petición.
//   6. Spam de correos         -> máx. 3 solicitudes por hora por cuenta + límite por IP.
//   7. Saltarse el 2FA         -> si la cuenta tiene 2FA, también se pide el código.
//   8. Sesiones del atacante   -> al restablecer se cierran TODAS las sesiones.
const crypto = require('crypto');
const config = require('../config/env');
const { query, transaccion } = require('../config/db');
const Usuario = require('../models/usuarioModel');
const Auditoria = require('../models/auditoriaModel');
const Bloqueo = require('./bloqueoService');
const Sesiones = require('./sesionesService');
const Totp = require('./totpService');
const Correo = require('./correoService');
const { sha256 } = require('./cifrado');

const MINUTOS_VIGENCIA = 15;
const MAX_POR_HORA = 3;

async function solicitar(req, email) {
  const usuario = await Usuario.buscarPorEmail(email);
  if (!usuario || !usuario.activo) {
    await Auditoria.desde(req, 'recuperacion_solicitada', { detalle: { email, existe: false } });
    return;
  }

  const { rows } = await query(
    "SELECT COUNT(*)::int AS n FROM tokens_recuperacion WHERE usuario_id = $1 AND creado > NOW() - INTERVAL '1 hour'",
    [usuario.id]
  );
  if (rows[0].n >= MAX_POR_HORA) {
    await Auditoria.desde(req, 'recuperacion_limitada', { usuarioId: usuario.id });
    return;
  }

  const token = crypto.randomBytes(32).toString('base64url');
  await transaccion(async (q) => {
    // Un token nuevo invalida los anteriores.
    await q('UPDATE tokens_recuperacion SET usado = NOW() WHERE usuario_id = $1 AND usado IS NULL', [usuario.id]);
    await q(
      `INSERT INTO tokens_recuperacion (usuario_id, token_hash, expira, ip)
       VALUES ($1, $2, NOW() + make_interval(mins => $3), $4)`,
      [usuario.id, sha256(token), MINUTOS_VIGENCIA, req.ip]
    );
  });
  await Auditoria.desde(req, 'recuperacion_solicitada', { usuarioId: usuario.id, detalle: { existe: true } });

  Correo.enviar({
    para: usuario.email,
    asunto: 'Recupera tu contraseña',
    titulo: 'Crea una nueva contraseña',
    parrafos: [
      `Hola ${usuario.nombre}: recibimos una solicitud para restablecer tu contraseña (IP ${req.ip}).`,
      `Tu código de recuperación (válido por ${MINUTOS_VIGENCIA} minutos y un solo uso) es: ${token}`,
      `Úsalo en: POST ${config.appUrl}/api/v1/auth/password/restablecer  con { "token": "...", "passwordNueva": "..." }`,
      'Si no lo pediste tú, ignora este correo: tu contraseña actual sigue funcionando.',
    ],
  });
}

// Devuelve { ok } o { ok:false, motivo, requiere2fa? }
async function restablecer(req, { token, passwordNueva, codigo2fa, hashear }) {
  const { rows } = await query(
    `SELECT t.id, t.usuario_id, u.email, u.nombre, u.activo, u.totp_activo
       FROM tokens_recuperacion t JOIN usuarios u ON u.id = t.usuario_id
      WHERE t.token_hash = $1 AND t.usado IS NULL AND t.expira > NOW()`,
    [sha256(token)]
  );
  const t = rows[0];
  if (!t || !t.activo) {
    await Auditoria.desde(req, 'recuperacion_token_invalido');
    return { ok: false, motivo: 'El código de recuperación no es válido o ya venció' };
  }
  if (t.totp_activo) {
    if (!codigo2fa) return { ok: false, motivo: 'Esta cuenta tiene verificación en dos pasos: envía también "codigo2fa"', requiere2fa: true };
    const v = await Totp.verificar(t.usuario_id, codigo2fa);
    if (!v.ok) {
      await Auditoria.desde(req, 'recuperacion_2fa_fallido', { usuarioId: t.usuario_id });
      return { ok: false, motivo: 'Código de verificación incorrecto', requiere2fa: true };
    }
  }

  const hash = await hashear(passwordNueva);
  const marcado = await transaccion(async (q) => {
    // Marca el token como usado SOLO si nadie lo usó entre medio (un solo uso real).
    const r = await q('UPDATE tokens_recuperacion SET usado = NOW() WHERE id = $1 AND usado IS NULL', [t.id]);
    if (r.rowCount === 0) return false;
    await Usuario.cambiarPassword(t.usuario_id, hash, q);
    return true;
  });
  if (!marcado) return { ok: false, motivo: 'El código de recuperación no es válido o ya venció' };

  const cerradas = await Sesiones.cerrarTodas(t.usuario_id);
  await Bloqueo.limpiar(t.email);
  await Auditoria.desde(req, 'recuperacion_completada', { usuarioId: t.usuario_id, detalle: { sesionesCerradas: cerradas } });
  Correo.enviar({
    para: t.email,
    asunto: 'Tu contraseña fue restablecida',
    titulo: 'Contraseña restablecida',
    parrafos: [
      `Hola ${t.nombre}: tu contraseña se restableció desde la IP ${req.ip}.`,
      `Cerramos ${cerradas} sesión(es) abiertas. Inicia sesión con tu nueva contraseña.`,
      'Si no fuiste tú, contacta al administrador de inmediato.',
    ],
  });
  return { ok: true, sesionesCerradas: cerradas };
}

module.exports = { solicitar, restablecer, MINUTOS_VIGENCIA };
