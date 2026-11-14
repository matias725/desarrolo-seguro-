// Pruebas de seguridad de cuentas: bloqueo por cuenta, 2FA, recuperación de
// contraseña, cierre de sesiones y alertas.
// Se simulan IPs distintas con X-Forwarded-For (TRUST_PROXY=1 solo en este proceso)
// y se suben los límites por IP para probar el bloqueo POR CUENTA de forma aislada.
process.env.TRUST_PROXY = '1';
process.env.LIMITE_LOGIN_15MIN = '1000';
process.env.LIMITE_REGISTRO_HORA = '1000';
process.env.LIMITE_RECUPERACION_HORA = '1000';
process.env.LIMITE_API_5MIN = '100000';

const { test, describe, after, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../src/app');
const { pool, query } = require('../src/config/db');
const { buzon } = require('../src/services/correoService');
const { cliente, codigo, activar2fa, nuevoUsuario, nuevoAdmin, unico, esperarCorreos } = require('./ayudantes');

after(() => pool.end());

let ipN = 10;
const ipNueva = () => `203.0.113.${ipN++}`;
const correosPara = (email) => buzon.filter((m) => m.para === email);

let admin;
before(async () => {
  admin = await cliente(ipNueva());
  await nuevoAdmin(admin);
});

describe('Bloqueo de cuenta por intentos fallidos', () => {
  test('5 fallos bloquean la cuenta 15 min, aunque el atacante cambie de IP', async () => {
    const victima = await nuevoUsuario(await cliente(ipNueva()));
    let res;
    for (let i = 1; i <= 5; i++) {
      // Cada intento desde una IP distinta: el límite por IP no lo detendría.
      res = await (await cliente(ipNueva())).login(victima.email, `incorrecta${i}`);
      assert.strictEqual(res.status, i < 5 ? 401 : 423, `intento ${i}`);
    }
    assert.match(res.body.error, /bloqueada 15 minutos/);

    // Ni siquiera la contraseña correcta entra mientras dure el bloqueo.
    const correcta = await (await cliente(ipNueva())).login(victima.email, victima.password);
    assert.strictEqual(correcta.status, 423);

    await esperarCorreos();
    assert.ok(correosPara(victima.email).some((m) => /bloqueamos/i.test(m.asunto)), 'avisa al dueño por correo');

    // El admin lo ve y lo desbloquea.
    const lista = await admin.get(`/api/v1/admin/usuarios?q=${encodeURIComponent(victima.email.split('@')[0])}`);
    assert.ok(lista.body.datos[0].bloqueadoHasta);
    assert.strictEqual((await admin.post(`/api/v1/admin/usuarios/${victima.id}/desbloquear`)).status, 200);
    assert.strictEqual((await (await cliente(ipNueva())).login(victima.email, victima.password)).status, 200);
  });

  test('un correo que NO existe se bloquea igual (no revela qué cuentas existen)', async () => {
    const fantasma = unico('fantasma');
    let res;
    for (let i = 1; i <= 5; i++) res = await (await cliente(ipNueva())).login(fantasma, `x${i}`);
    assert.strictEqual(res.status, 423);
  });

  test('el login correcto reinicia el contador', async () => {
    const u = await nuevoUsuario(await cliente(ipNueva()));
    for (let i = 0; i < 4; i++) await (await cliente(ipNueva())).login(u.email, 'mala');
    assert.strictEqual((await (await cliente(ipNueva())).login(u.email, u.password)).status, 200);
    for (let i = 0; i < 4; i++) await (await cliente(ipNueva())).login(u.email, 'mala');
    assert.strictEqual((await (await cliente(ipNueva())).login(u.email, u.password)).status, 200);
  });

  test('el formulario web también muestra el bloqueo', async () => {
    const u = await nuevoUsuario(await cliente(ipNueva()));
    const agente = request.agent(app);
    const pagina = await agente.get('/restaurantes/1').set('X-Forwarded-For', ipNueva());
    const csrf = /name="csrf-token" content="([a-f0-9]+)"/.exec(pagina.text)[1];
    for (let i = 0; i < 5; i++) {
      await agente.post('/login').set('X-Forwarded-For', ipNueva()).type('form').send({ _csrf: csrf, email: u.email, password: 'mala', volver: '/restaurantes/1' });
    }
    const despues = await agente.get('/restaurantes/1').set('X-Forwarded-For', ipNueva());
    assert.match(despues.text, /bloqueada 15 minutos/);
  });
});

describe('Verificación en dos pasos (TOTP)', () => {
  test('activar: QR, código incorrecto rechazado, 8 códigos de respaldo', async () => {
    const c = await cliente(ipNueva());
    const u = await nuevoUsuario(c);
    const conf = await c.post('/api/v1/auth/2fa/configurar');
    assert.strictEqual(conf.status, 200);
    assert.match(conf.body.datos.qr, /^data:image\/png;base64,/);
    assert.match(conf.body.datos.otpauthUri, /^otpauth:\/\/totp\//);

    const mala = await c.post('/api/v1/auth/2fa/activar', { codigo: '000000', password: u.password });
    assert.strictEqual(mala.status, 400);
    const sinPass = await c.post('/api/v1/auth/2fa/activar', { codigo: codigo(conf.body.datos.secreto, 0), password: 'otra' });
    assert.strictEqual(sinPass.status, 400);

    const ok = await c.post('/api/v1/auth/2fa/activar', { codigo: codigo(conf.body.datos.secreto, 0), password: u.password });
    assert.strictEqual(ok.status, 200);
    assert.strictEqual(ok.body.datos.codigosRespaldo.length, 8);

    // El secreto se guarda cifrado, nunca en texto plano.
    const { rows } = await query('SELECT totp_secreto, totp_respaldo FROM usuarios WHERE id = $1', [u.id]);
    assert.ok(!rows[0].totp_secreto.includes(conf.body.datos.secreto));
    assert.ok(!JSON.stringify(rows[0].totp_respaldo).includes(ok.body.datos.codigosRespaldo[0]));
  });

  test('login con 2FA: la contraseña sola no da acceso; código correcto sí; reutilizarlo no', async () => {
    const c = await cliente(ipNueva());
    const u = await nuevoUsuario(c);
    const { secreto } = await activar2fa(c, u.password);

    const otro = await cliente(ipNueva());
    const paso1 = await otro.login(u.email, u.password);
    assert.strictEqual(paso1.status, 200);
    assert.strictEqual(paso1.body.datos.requiere2fa, true);
    assert.strictEqual((await otro.get('/api/v1/auth/yo')).status, 401, 'aún no hay sesión');

    assert.strictEqual((await otro.post('/api/v1/auth/2fa/verificar', { codigo: '123456' })).status, 401);
    const cod = codigo(secreto, 1);
    const paso2 = otro.actualizarCsrf(await otro.post('/api/v1/auth/2fa/verificar', { codigo: cod }));
    assert.strictEqual(paso2.status, 200);
    assert.strictEqual((await otro.get('/api/v1/auth/yo')).body.datos.sesionCon2fa, true);

    // Anti-replay: alguien que vio el código no puede usarlo de nuevo.
    const atacante = await cliente(ipNueva());
    await atacante.login(u.email, u.password);
    const replay = await atacante.post('/api/v1/auth/2fa/verificar', { codigo: cod });
    assert.strictEqual(replay.status, 401);
    assert.match(replay.body.error, /ya se usó/);
  });

  test('códigos de respaldo: sirven una sola vez', async () => {
    const c = await cliente(ipNueva());
    const u = await nuevoUsuario(c);
    const { respaldo } = await activar2fa(c, u.password);

    const a = await cliente(ipNueva());
    await a.login(u.email, u.password);
    const r = await a.post('/api/v1/auth/2fa/verificar', { codigo: respaldo[0] });
    assert.strictEqual(r.status, 200);
    assert.match(r.body.datos.aviso, /Te quedan 7/);

    const b = await cliente(ipNueva());
    await b.login(u.email, u.password);
    assert.strictEqual((await b.post('/api/v1/auth/2fa/verificar', { codigo: respaldo[0] })).status, 401);
  });

  test('5 códigos incorrectos bloquean la cuenta y generan alerta "alguien conoce tu contraseña"', async () => {
    const c = await cliente(ipNueva());
    const u = await nuevoUsuario(c);
    await activar2fa(c, u.password);
    const atacante = await cliente(ipNueva());
    await atacante.login(u.email, u.password);
    let res;
    for (let i = 0; i < 5; i++) res = await atacante.post('/api/v1/auth/2fa/verificar', { codigo: String(100000 + i) });
    assert.strictEqual(res.status, 423);

    await esperarCorreos();
    assert.ok(correosPara(u.email).some((m) => /conoce tu contraseña/.test(m.asunto)));
    const alertas = await admin.get('/api/v1/admin/alertas?tipo=2fa_fallido_repetido');
    assert.ok(alertas.body.datos.some((a) => a.usuario_id === u.id && a.severidad === 'alta'));
  });

  test('formulario web: contraseña + código de 6 dígitos (sin cambiar el front)', async () => {
    const c = await cliente(ipNueva());
    const u = await nuevoUsuario(c);
    const { secreto } = await activar2fa(c, u.password);
    const ip = ipNueva();
    const agente = request.agent(app);
    const csrf = /name="csrf-token" content="([a-f0-9]+)"/.exec((await agente.get('/restaurantes/1').set('X-Forwarded-For', ip)).text)[1];
    const enviar = (password) => agente.post('/login').set('X-Forwarded-For', ip).type('form').send({ _csrf: csrf, email: u.email, password, volver: '/restaurantes/1' });

    await enviar(u.password); // sin código
    assert.match((await agente.get('/restaurantes/1').set('X-Forwarded-For', ip)).text, /seguida del código de 6 dígitos/);

    await enviar(u.password + codigo(secreto, 1));
    const pagina = await agente.get('/restaurantes/1').set('X-Forwarded-For', ip);
    assert.match(pagina.text, /Cerrar sesión/);
  });

  test('administradores: 2FA obligatorio y sesión iniciada con código', async () => {
    const c = await cliente(ipNueva());
    const u = await nuevoUsuario(c, { rol: 'admin', password: 'AdminClave123' });
    const sin = await c.get('/api/v1/admin/estadisticas');
    assert.strictEqual(sin.status, 403);
    assert.match(sin.body.error, /verificación en dos pasos/);

    const { secreto } = await activar2fa(c, u.password);
    assert.strictEqual((await c.get('/api/v1/admin/estadisticas')).status, 200);
    assert.strictEqual((await c.post('/api/v1/auth/2fa/desactivar', { codigo: codigo(secreto, 1), password: u.password })).status, 409);

    // Un admin no puede reiniciarse su propio 2FA; otro admin sí puede.
    assert.strictEqual((await c.post(`/api/v1/admin/usuarios/${u.id}/2fa/reiniciar`)).status, 409);
    assert.strictEqual((await admin.post(`/api/v1/admin/usuarios/${u.id}/2fa/reiniciar`)).status, 200);
    assert.strictEqual((await c.get('/api/v1/auth/yo')).status, 401, 'el reinicio cerró sus sesiones');
  });
});

describe('Recuperación de contraseña', () => {
  const tokenDe = (email) => {
    const m = [...correosPara(email)].reverse().find((x) => /Recupera/.test(x.asunto));
    return m && /es: ([A-Za-z0-9_-]{43})/.exec(m.texto)[1];
  };

  test('misma respuesta exista o no la cuenta; solo la real recibe correo', async () => {
    const u = await nuevoUsuario(await cliente(ipNueva()));
    const fantasma = unico('nadie');
    const c = await cliente(ipNueva());
    const r1 = await c.post('/api/v1/auth/password/olvide', { email: u.email });
    const r2 = await c.post('/api/v1/auth/password/olvide', { email: fantasma });
    assert.strictEqual(r1.status, 200);
    assert.deepStrictEqual(r1.body, r2.body);
    await esperarCorreos();
    assert.ok(tokenDe(u.email));
    assert.strictEqual(correosPara(fantasma).length, 0);
  });

  test('flujo completo: token de un solo uso, hash en la BD, cierra sesiones', async () => {
    const sesionVieja = await cliente(ipNueva());
    const u = await nuevoUsuario(sesionVieja);
    const c = await cliente(ipNueva());
    await c.post('/api/v1/auth/password/olvide', { email: u.email });
    await esperarCorreos();
    const token = tokenDe(u.email);

    const { rows } = await query('SELECT token_hash FROM tokens_recuperacion WHERE usuario_id = $1', [u.id]);
    assert.ok(rows.every((r) => r.token_hash !== token), 'en la BD solo está el hash');

    const debil = await c.post('/api/v1/auth/password/restablecer', { token, passwordNueva: '123' });
    assert.strictEqual(debil.status, 400);
    const ok = await c.post('/api/v1/auth/password/restablecer', { token, passwordNueva: 'NuevaClave2026' });
    assert.strictEqual(ok.status, 200);
    assert.strictEqual((await c.post('/api/v1/auth/password/restablecer', { token, passwordNueva: 'OtraClave2026' })).status, 400, 'un solo uso');

    assert.strictEqual((await sesionVieja.get('/api/v1/auth/yo')).status, 401, 'sesiones anteriores cerradas');
    assert.strictEqual((await (await cliente(ipNueva())).login(u.email, u.password)).status, 401);
    assert.strictEqual((await (await cliente(ipNueva())).login(u.email, 'NuevaClave2026')).status, 200);
  });

  test('pedir un código nuevo invalida el anterior, y los vencidos no sirven', async () => {
    const u = await nuevoUsuario(await cliente(ipNueva()));
    const c = await cliente(ipNueva());
    await c.post('/api/v1/auth/password/olvide', { email: u.email });
    await esperarCorreos();
    const primero = tokenDe(u.email);
    await c.post('/api/v1/auth/password/olvide', { email: u.email });
    await esperarCorreos();
    const segundo = tokenDe(u.email);
    assert.notStrictEqual(primero, segundo);
    assert.strictEqual((await c.post('/api/v1/auth/password/restablecer', { token: primero, passwordNueva: 'NuevaClave2026' })).status, 400);

    await query("UPDATE tokens_recuperacion SET expira = NOW() - INTERVAL '1 minute' WHERE usuario_id = $1", [u.id]);
    assert.strictEqual((await c.post('/api/v1/auth/password/restablecer', { token: segundo, passwordNueva: 'NuevaClave2026' })).status, 400);
  });

  test('el enlace del correo NO usa la cabecera Host (anti host header injection)', async () => {
    const u = await nuevoUsuario(await cliente(ipNueva()));
    const c = await cliente(ipNueva());
    await c.post('/api/v1/auth/password/olvide', { email: u.email }).set('Host', 'sitio-malicioso.com').set('X-Forwarded-Host', 'sitio-malicioso.com');
    await esperarCorreos();
    const correo = [...correosPara(u.email)].reverse().find((x) => /Recupera/.test(x.asunto));
    assert.ok(!correo.texto.includes('sitio-malicioso'));
  });

  test('si la cuenta tiene 2FA, también pide el código', async () => {
    const c0 = await cliente(ipNueva());
    const u = await nuevoUsuario(c0);
    const { secreto } = await activar2fa(c0, u.password);
    const c = await cliente(ipNueva());
    await c.post('/api/v1/auth/password/olvide', { email: u.email });
    await esperarCorreos();
    const token = tokenDe(u.email);
    const sin = await c.post('/api/v1/auth/password/restablecer', { token, passwordNueva: 'NuevaClave2026' });
    assert.strictEqual(sin.status, 400);
    assert.strictEqual(sin.body.detalles[0].campo, 'codigo2fa');
    const con = await c.post('/api/v1/auth/password/restablecer', { token, passwordNueva: 'NuevaClave2026', codigo2fa: codigo(secreto, 1) });
    assert.strictEqual(con.status, 200);
  });
});

describe('Cerrar sesiones', () => {
  test('ver mis sesiones y cerrar todas las demás', async () => {
    const pc = await cliente(ipNueva());
    const u = await nuevoUsuario(pc);
    const celular = await cliente(ipNueva());
    await celular.login(u.email, u.password);

    const lista = await pc.get('/api/v1/auth/sesiones');
    assert.strictEqual(lista.body.datos.length, 2);
    assert.strictEqual(lista.body.datos.filter((s) => s.actual).length, 1);
    assert.ok(lista.body.datos.every((s) => /^[a-f0-9]{16}$/.test(s.id)), 'nunca expone el id real de sesión');

    const r = await pc.post('/api/v1/auth/sesiones/cerrar-todas', {});
    assert.strictEqual(r.body.datos.cerradas, 1);
    assert.strictEqual((await celular.get('/api/v1/auth/yo')).status, 401, 'el otro dispositivo quedó fuera');
    assert.strictEqual((await pc.get('/api/v1/auth/yo')).status, 200, 'esta sesión sigue');
  });

  test('cerrar una sesión puntual por su id', async () => {
    const pc = await cliente(ipNueva());
    const u = await nuevoUsuario(pc);
    const tablet = await cliente(ipNueva());
    await tablet.login(u.email, u.password);
    const otra = (await pc.get('/api/v1/auth/sesiones')).body.datos.find((s) => !s.actual);
    assert.strictEqual((await pc.delete(`/api/v1/auth/sesiones/${otra.id}`)).status, 200);
    assert.strictEqual((await tablet.get('/api/v1/auth/yo')).status, 401);
    assert.strictEqual((await pc.delete('/api/v1/auth/sesiones/0000000000000000')).status, 404);
  });

  test('cambiar la contraseña cierra las otras sesiones', async () => {
    const pc = await cliente(ipNueva());
    const u = await nuevoUsuario(pc);
    const celular = await cliente(ipNueva());
    await celular.login(u.email, u.password);
    const r = pc.actualizarCsrf(await pc.patch('/api/v1/auth/yo/password', { passwordActual: u.password, passwordNueva: 'CambioClave2026' }));
    assert.strictEqual(r.body.datos.sesionesCerradas, 1);
    assert.strictEqual((await celular.get('/api/v1/auth/yo')).status, 401);
    assert.strictEqual((await pc.get('/api/v1/auth/yo')).status, 200);
  });

  test('desactivar una cuenta (admin) la expulsa al instante', async () => {
    const c = await cliente(ipNueva());
    const u = await nuevoUsuario(c);
    await admin.patch(`/api/v1/admin/usuarios/${u.id}`, { activo: false });
    assert.strictEqual((await c.get('/api/v1/auth/yo')).status, 401);
  });
});

describe('Alertas de seguridad', () => {
  test('login desde una IP nueva: alerta baja + correo al usuario', async () => {
    const u = await nuevoUsuario(await cliente('198.51.100.1'));
    await (await cliente('198.51.100.1')).login(u.email, u.password); // IP conocida: sin alerta
    await esperarCorreos();
    assert.ok(!correosPara(u.email).some((m) => /Nuevo inicio/.test(m.asunto)));

    await (await cliente('198.51.100.2')).login(u.email, u.password);
    await esperarCorreos();
    assert.ok(correosPara(u.email).some((m) => /Nuevo inicio de sesión/.test(m.asunto)));
    const a = await admin.get('/api/v1/admin/alertas?tipo=login_ip_nueva');
    assert.ok(a.body.datos.some((x) => x.usuario_id === u.id && x.ip === '198.51.100.2'));
  });

  test('misma cuenta desde 3 IPs en una hora: alerta', async () => {
    const u = await nuevoUsuario(await cliente('192.0.2.1'));
    await (await cliente('192.0.2.2')).login(u.email, u.password);
    await (await cliente('192.0.2.3')).login(u.email, u.password);
    const a = await admin.get('/api/v1/admin/alertas?tipo=login_ips_multiples');
    assert.ok(a.body.datos.some((x) => x.usuario_id === u.id));
  });

  test('una IP probando muchas cuentas: alerta ALTA + correo a los admins', async () => {
    const ip = ipNueva();
    for (let i = 0; i < 5; i++) await (await cliente(ip)).login(unico(`victima${i}`), 'Password123');
    await esperarCorreos();
    const a = await admin.get('/api/v1/admin/alertas?tipo=ataque_multiples_cuentas&severidad=alta');
    const alerta = a.body.datos.find((x) => x.ip === ip);
    assert.ok(alerta);
    assert.ok(a.body.pendientes.alta >= 1);
    assert.ok(buzon.some((m) => /\[Alerta alta\]/.test(m.asunto)));

    const revisada = await admin.patch(`/api/v1/admin/alertas/${alerta.id}`, { revisada: true });
    assert.strictEqual(revisada.body.datos.revisada, true);
  });

  test('un cliente no puede ver las alertas', async () => {
    const c = await cliente(ipNueva());
    await nuevoUsuario(c);
    assert.strictEqual((await c.get('/api/v1/admin/alertas')).status, 403);
  });
});
