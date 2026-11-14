// Doble factor con TOTP (RFC 6238): códigos de 6 dígitos que cambian cada
// 30 s, compatibles con Google Authenticator, Microsoft Authenticator, Authy...
const crypto = require('crypto');
const OTPAuth = require('otpauth');
const QRCode = require('qrcode');
const Usuario = require('../models/usuarioModel');
const { cifrar, descifrar, sha256 } = require('./cifrado');

const PERIODO = 30;
const EMISOR = 'Carta Digital';

function totpDe(secretoBase32, etiqueta) {
  return new OTPAuth.TOTP({
    issuer: EMISOR,
    label: etiqueta,
    algorithm: 'SHA1',
    digits: 6,
    period: PERIODO,
    secret: OTPAuth.Secret.fromBase32(secretoBase32),
  });
}

const pasoActual = () => Math.floor(Date.now() / 1000 / PERIODO);

// Genera un secreto nuevo (pendiente hasta que el usuario lo confirme con un código).
async function configurar(usuario) {
  const secreto = new OTPAuth.Secret({ size: 20 });
  await Usuario.guardarTotpPendiente(usuario.id, cifrar(secreto.base32));
  const uri = totpDe(secreto.base32, usuario.email).toString();
  return {
    secreto: secreto.base32,
    otpauthUri: uri,
    qr: await QRCode.toDataURL(uri, { margin: 1, width: 240 }),
  };
}

// Devuelve el intervalo (paso) del código si es válido (±1 intervalo de tolerancia).
function validarCodigo(secretoCifrado, email, codigo) {
  if (!/^\d{6}$/.test(String(codigo || ''))) return null;
  const delta = totpDe(descifrar(secretoCifrado), email).validate({ token: String(codigo), window: 1 });
  return delta === null ? null : pasoActual() + delta;
}

// Códigos de respaldo: 8 de formato XXXX-XXXX. Se muestran UNA vez; en la BD solo el hash.
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generarRespaldo(cantidad = 8) {
  const codigos = Array.from({ length: cantidad }, () => {
    const b = crypto.randomBytes(8);
    const c = Array.from(b, (x) => ALFABETO[x % ALFABETO.length]).join('');
    return `${c.slice(0, 4)}-${c.slice(4)}`;
  });
  return { codigos, hashes: codigos.map(hashRespaldo) };
}
const hashRespaldo = (codigo) => sha256(String(codigo).toUpperCase().replace(/[^A-Z0-9]/g, ''));

// Confirma la configuración con el primer código.
async function activar(usuarioId, codigo) {
  const u = await Usuario.datos2fa(usuarioId);
  if (!u || !u.totp_pendiente) return { ok: false, motivo: 'Primero llama a /auth/2fa/configurar' };
  const paso = validarCodigo(u.totp_pendiente, u.email, codigo);
  if (paso === null) return { ok: false, motivo: 'Código incorrecto' };
  const { codigos, hashes } = generarRespaldo();
  await Usuario.activarTotp(u.id, u.totp_pendiente, paso, hashes);
  return { ok: true, codigosRespaldo: codigos };
}

// Verifica un código de la app o un código de respaldo en el login.
// Anti-replay: el mismo código de la app no se acepta dos veces.
async function verificar(usuarioId, codigo) {
  const u = await Usuario.datos2fa(usuarioId);
  if (!u || !u.totp_activo) return { ok: false };
  const limpio = String(codigo || '').trim();

  if (/^\d{6}$/.test(limpio)) {
    const paso = validarCodigo(u.totp_secreto, u.email, limpio);
    if (paso === null) return { ok: false };
    if (!(await Usuario.marcarPasoTotp(u.id, paso))) return { ok: false, reutilizado: true };
    return { ok: true, metodo: 'app' };
  }
  if (/^[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}$/.test(limpio)) {
    const ok = await Usuario.consumirRespaldo(u.id, hashRespaldo(limpio));
    return ok ? { ok: true, metodo: 'respaldo', restantes: u.respaldos_restantes - 1 } : { ok: false };
  }
  return { ok: false };
}

module.exports = { configurar, activar, verificar, generarRespaldo, PERIODO };
