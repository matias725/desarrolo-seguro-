// Cifrado simétrico AES-256-GCM para datos sensibles guardados en la BD
// (los secretos 2FA). GCM además detecta si el dato fue alterado.
// Formato guardado: v1:<iv>:<tag>:<cifrado>  (base64url)
const crypto = require('crypto');
const config = require('../config/env');

const CLAVE = crypto.hkdfSync(
  'sha256',
  config.cifradoClave || config.sessionSecret,
  'carta-digital',
  'secretos-2fa-v1',
  32
);
const clave = Buffer.from(CLAVE);

function cifrar(texto) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', clave, iv);
  const datos = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), datos.toString('base64url')].join(':');
}

function descifrar(guardado) {
  const [version, iv, tag, datos] = String(guardado).split(':');
  if (version !== 'v1') throw new Error('Formato de dato cifrado desconocido');
  const d = crypto.createDecipheriv('aes-256-gcm', clave, Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(datos, 'base64url')), d.final()]).toString('utf8');
}

const sha256 = (texto) => crypto.createHash('sha256').update(String(texto)).digest('hex');

module.exports = { cifrar, descifrar, sha256 };
