// Páginas web nuevas: cuenta, 2FA, pedidos y panel de administración.
// Se prueba sobre todo el CONTROL DE ACCESO del lado del servidor y que el
// contenido escrito por usuarios se muestre escapado.
process.env.TRUST_PROXY = '1';
process.env.LIMITE_LOGIN_15MIN = '1000';
process.env.LIMITE_REGISTRO_HORA = '1000';
process.env.LIMITE_RECUPERACION_HORA = '1000';
process.env.LIMITE_PEDIDOS_HORA = '1000';
process.env.LIMITE_API_5MIN = '100000';

const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/config/db');
const { buzon } = require('../src/services/correoService');
const { cliente, nuevoUsuario, nuevoAdmin, esperarCorreos } = require('./ayudantes');

after(() => pool.end());

let ipN = 10;
const ipNueva = () => `198.51.100.${ipN++}`;
// Petición de página HTML con la misma sesión que el cliente de la API.
const pagina = (c, url) => c.agente.get(url).set('X-Forwarded-For', c.ip).set('Accept', 'text/html');

async function itemDisponible(c) {
  const r = await c.get('/api/v1/restaurantes/1/platos?porPagina=1');
  assert.strictEqual(r.status, 200);
  return r.body.datos[0].id;
}

describe('Páginas de cuenta', () => {
  test('sin sesión: las páginas privadas llevan a /ingresar y vuelven después', async () => {
    const anonimo = request(app);
    for (const ruta of ['/cuenta', '/mis-pedidos', '/admin']) {
      const r = await anonimo.get(ruta);
      assert.strictEqual(r.status, 302, ruta);
      assert.strictEqual(r.headers.location, `/ingresar?volver=${encodeURIComponent(ruta)}`);
    }
    for (const ruta of ['/ingresar', '/registro', '/recuperar']) {
      const r = await anonimo.get(ruta);
      assert.strictEqual(r.status, 200, ruta);
      assert.match(r.text, /name="csrf-token"/);
    }
  });

  test('ninguna página nueva usa scripts inline (la CSP los bloquearía)', async () => {
    const c = await cliente(ipNueva());
    await nuevoUsuario(c);
    const anonimo = await cliente(ipNueva());
    const rutas = [
      ...['/ingresar', '/registro'].map((ruta) => [anonimo, ruta]),
      ...['/', '/recuperar', '/cuenta', '/mis-pedidos', '/restaurantes/1/carrito'].map((ruta) => [c, ruta]),
    ];
    for (const [quien, ruta] of rutas) {
      const r = await pagina(quien, ruta);
      assert.strictEqual(r.status, 200, ruta);
      const scripts = r.text.match(/<script\b[^>]*>/g) || [];
      assert.ok(scripts.length > 0);
      assert.ok(scripts.every((s) => /\ssrc="\/js\/[a-z]+\.js\?v=[a-f0-9]{10}"/.test(s)), `${ruta}: ${scripts.join(' ')}`);
      assert.doesNotMatch(r.text, /\son[a-z]+="/i, `${ruta}: atributos on*= inline`);
    }
  });

  test('/cuenta muestra los datos del usuario con sesión, escapados', async () => {
    const c = await cliente(ipNueva());
    const u = await nuevoUsuario(c);
    const r = await pagina(c, '/cuenta');
    assert.strictEqual(r.status, 200);
    assert.ok(r.text.includes(u.email));
    assert.match(r.text, /Activar verificación en dos pasos/);
  });

  test('el correo de recuperación lleva a /recuperar con el código después de "#"', async () => {
    const c = await cliente(ipNueva());
    const u = await nuevoUsuario(c);
    await c.post('/api/v1/auth/password/olvide', { email: u.email });
    await esperarCorreos();
    const correo = buzon.filter((m) => m.para === u.email && /Recupera/.test(m.asunto)).pop();
    assert.match(correo.texto, /\/recuperar#token=[A-Za-z0-9_-]{43}/);
    assert.doesNotMatch(correo.texto, /\?token=/, 'el token no debe ir en la query (quedaría en logs)');
  });
});

describe('Panel de administración (página)', () => {
  test('un cliente recibe 404: el panel no se revela', async () => {
    const c = await cliente(ipNueva());
    await nuevoUsuario(c);
    const r = await pagina(c, '/admin');
    assert.strictEqual(r.status, 404);
    assert.doesNotMatch(r.text, /admin-tabs|Panel de administración/);
    assert.doesNotMatch((await pagina(c, '/')).text, /href="\/admin"/, 'el menú no muestra el enlace');
  });

  test('admin sin 2FA: la página pide activarla; con 2FA: muestra el panel', async () => {
    const sin = await cliente(ipNueva());
    await nuevoUsuario(sin, { rol: 'admin', password: 'AdminClave123' });
    const r1 = await pagina(sin, '/admin');
    assert.strictEqual(r1.status, 200);
    assert.match(r1.text, /deben activar la verificación en dos pasos/);
    assert.doesNotMatch(r1.text, /id="admin-tabs"/);

    const con = await cliente(ipNueva());
    await nuevoAdmin(con);
    const r2 = await pagina(con, '/admin');
    assert.strictEqual(r2.status, 200);
    assert.match(r2.text, /id="admin-tabs"/);
    assert.match(r2.text, /src="\/js\/admin\.js\?v=/);
  });

  test('si le quitan el rol, pierde el panel al instante (se lee de la BD)', async () => {
    const jefe = await cliente(ipNueva());
    await nuevoAdmin(jefe);
    const otro = await cliente(ipNueva());
    const u = await nuevoAdmin(otro);
    assert.strictEqual((await pagina(otro, '/admin')).status, 200);
    assert.strictEqual((await jefe.patch(`/api/v1/admin/usuarios/${u.id}`, { rol: 'cliente' })).status, 200);
    assert.strictEqual((await pagina(otro, '/admin')).status, 404);
  });
});

describe('Pedidos en la web', () => {
  test('confirmar, seguir, ver en el historial y cancelar solo el dueño', async () => {
    const c = await cliente(ipNueva());
    await nuevoUsuario(c);
    const itemId = await itemDisponible(c);
    assert.strictEqual((await c.post('/api/v1/restaurantes/1/carrito', { itemId, cantidad: 2 })).status, 200);
    const nota = '<script>alert(1)</script> sin cebolla';
    const r = await c.post('/api/v1/restaurantes/1/pedidos', { mesa: '7', nota });
    assert.strictEqual(r.status, 201);
    const { codigo } = r.body.datos;

    const seguimiento = await pagina(c, `/pedidos/${codigo}`);
    assert.strictEqual(seguimiento.status, 200);
    assert.ok(seguimiento.text.includes(codigo));
    assert.ok(seguimiento.text.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'la nota se muestra escapada');
    assert.ok(!seguimiento.text.includes(nota));
    assert.match(seguimiento.text, /id="cancelar-pedido"/);

    // Otra persona con el código ve el estado, pero no puede cancelarlo.
    const extrano = await cliente(ipNueva());
    const ajena = await pagina(extrano, `/pedidos/${codigo}`);
    assert.strictEqual(ajena.status, 200);
    assert.doesNotMatch(ajena.text, /id="cancelar-pedido"/);
    assert.strictEqual((await extrano.post(`/api/v1/pedidos/${codigo}/cancelar`)).status, 403);

    assert.ok((await pagina(c, '/mis-pedidos')).text.includes(codigo));
    assert.strictEqual((await c.post(`/api/v1/pedidos/${codigo}/cancelar`)).status, 200);
    assert.doesNotMatch((await pagina(c, `/pedidos/${codigo}`)).text, /id="cancelar-pedido"/);
  });

  test('/seguimiento valida el código y no permite redirecciones raras', async () => {
    const anonimo = request(app);
    const ok = await anonimo.get('/seguimiento?codigo=k7p2qx9m');
    assert.strictEqual(ok.headers.location, '/pedidos/K7P2QX9M');
    for (const malo of ['//evil.com', '../admin', 'ABC', 'K7P2QX9M/../../x', '<script>']) {
      const r = await anonimo.get(`/seguimiento?codigo=${encodeURIComponent(malo)}`);
      assert.strictEqual(r.status, 302);
      assert.strictEqual(r.headers.location, '/', malo);
    }
    assert.strictEqual((await anonimo.get('/pedidos/NOEXISTE')).status, 404);
    assert.strictEqual((await anonimo.get("/pedidos/1' OR '1'='1")).status, 404);
  });
});
