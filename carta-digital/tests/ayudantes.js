// Utilidades compartidas por las pruebas.
const request = require('supertest');
const OTPAuth = require('otpauth');
const app = require('../src/app');
const Usuario = require('../src/models/usuarioModel');
const Auth = require('../src/services/authService');

const unico = (prefijo) => `${prefijo}${Date.now()}${Math.floor(Math.random() * 1e6)}@carta.test`;

// Cliente de la API con su propia sesión y token CSRF. `ip` simula la IP de
// origen (X-Forwarded-For; requiere TRUST_PROXY=1 en el proceso de pruebas).
async function cliente(ip) {
  const agente = request.agent(app);
  const c = { agente, ip };
  const preparar = (r) => {
    if (c.ip) r.set('X-Forwarded-For', c.ip);
    return r.set('Accept', 'application/json');
  };
  c.csrf = (await preparar(agente.get('/api/v1/auth/csrf'))).body.datos.csrfToken;
  const enviar = (metodo) => (url, cuerpo) => {
    const r = preparar(c.agente[metodo](url)).set('X-CSRF-Token', c.csrf);
    return cuerpo === undefined ? r : r.send(cuerpo);
  };
  c.post = enviar('post');
  c.patch = enviar('patch');
  c.delete = enviar('delete');
  c.get = (url) => preparar(c.agente.get(url));
  c.actualizarCsrf = (res) => {
    if (res.body && res.body.datos && res.body.datos.csrfToken) c.csrf = res.body.datos.csrfToken;
    return res;
  };
  c.login = async (email, password) => c.actualizarCsrf(await c.post('/api/v1/auth/login', { email, password }));
  return c;
}

// Código TOTP de un intervalo futuro (+1 = siguiente 30 s). La app acepta ±1
// intervalo y rechaza reutilizar uno ya usado, así cada prueba pide uno nuevo.
function codigo(secreto, desplazamiento = 1) {
  const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secreto), digits: 6, period: 30 });
  return totp.generate({ timestamp: Date.now() + desplazamiento * 30000 });
}

// Activa el 2FA de la sesión del cliente; devuelve { secreto, respaldo }.
async function activar2fa(c, password) {
  const conf = await c.post('/api/v1/auth/2fa/configurar');
  const secreto = conf.body.datos.secreto;
  const act = await c.post('/api/v1/auth/2fa/activar', { codigo: codigo(secreto, 0), password });
  if (act.status !== 200) throw new Error(`No se pudo activar 2FA: ${JSON.stringify(act.body)}`);
  return { secreto, respaldo: act.body.datos.codigosRespaldo };
}

// Crea un usuario directamente en la BD (rol a elección) e inicia sesión con él.
async function nuevoUsuario(c, { rol = 'cliente', password = 'ClaveSegura123' } = {}) {
  const email = unico(rol);
  const u = await Usuario.crear({ nombre: `Prueba ${rol}`, email, passwordHash: await Auth.hashear(password), rol });
  const r = await c.login(email, password);
  if (r.status !== 200) throw new Error(`login falló: ${JSON.stringify(r.body)}`);
  return { ...u, password };
}

// Administrador listo para usar /admin: creado, con sesión y 2FA activo.
async function nuevoAdmin(c) {
  const u = await nuevoUsuario(c, { rol: 'admin', password: 'AdminClave123' });
  const dosPasos = await activar2fa(c, u.password);
  return { ...u, ...dosPasos };
}

const esperarCorreos = () => new Promise((r) => setTimeout(r, 60));

module.exports = { cliente, codigo, activar2fa, nuevoUsuario, nuevoAdmin, unico, esperarCorreos };
