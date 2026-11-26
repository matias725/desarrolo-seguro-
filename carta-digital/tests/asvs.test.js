// =============================================================================
// Pruebas de seguridad de la 4ª entrega (OWASP ASVS 5.0.0). Cada `describe`
// corresponde a una ficha del informe (docs/pruebas-seguridad.md).
//   ASVS 2.2.2  Validación en el servidor (valor permitido / fuera de rango)
//   ASVS 1.2.4  Consultas parametrizadas con un valor legítimo con apóstrofo
//   ASVS V8     Autorización (registro propio / ajeno / acción de otro rol)
//   ASVS V6+V7  Autenticación y sesión (antes / durante / después)
//   ASVS 16.5.1 Manejo de errores ante una falla de la base de datos
//   ASVS 16.3.1 Registro de inicios de sesión exitosos y fallidos
// =============================================================================
process.env.TRUST_PROXY = '1';
process.env.LIMITE_LOGIN_15MIN = '1000';
process.env.LIMITE_API_5MIN = '100000';
process.env.LIMITE_PEDIDOS_HORA = '1000';
process.env.LIMITE_COMENTARIOS_15MIN = '1000';

const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const app = require('../src/app');
const { pool } = require('../src/config/db');
const { cliente, nuevoUsuario, unico } = require('./ayudantes');
const Usuario = require('../src/models/usuarioModel');
const Auth = require('../src/services/authService');

after(() => pool.end());

let n = 10;
const ip = () => `192.0.2.${n++}`;

async function primerPlato(c) {
  const r = await c.get('/api/v1/restaurantes/1/platos?porPagina=1');
  return r.body.datos[0];
}

describe('ASVS 2.2.2 · Validación en el servidor', () => {
  test('cantidad 3 se acepta; cantidad 999 se rechaza con 400 y NO se guarda', async () => {
    const c = await cliente(ip());
    const plato = await primerPlato(c);

    const permitido = await c.post('/api/v1/restaurantes/1/carrito', { itemId: plato.id, cantidad: 3 });
    assert.strictEqual(permitido.status, 200);

    const fuera = await c.post('/api/v1/restaurantes/1/carrito', { itemId: plato.id, cantidad: 999 });
    assert.strictEqual(fuera.status, 400);
    assert.strictEqual(fuera.body.ok, false);
    assert.ok(fuera.body.detalles.some((d) => d.campo === 'cantidad'), 'el error indica el campo inválido');

    // El dato rechazado no quedó guardado: el carrito sigue con 3.
    const carrito = await c.get('/api/v1/restaurantes/1/carrito');
    const linea = carrito.body.datos.lineas.find((l) => l.itemId === plato.id);
    assert.strictEqual(linea.cantidad, 3);
    assert.strictEqual(carrito.body.datos.total, plato.precio * 3);
  });

  test('un campo no permitido (asignación masiva) también se rechaza', async () => {
    const c = await cliente(ip());
    const plato = await primerPlato(c);
    const r = await c.post('/api/v1/restaurantes/1/carrito', { itemId: plato.id, cantidad: 1, precio: 1 });
    assert.strictEqual(r.status, 400);
  });
});

describe('ASVS 1.2.4 · Consultas parametrizadas', () => {
  test("un comentario con apóstrofo se guarda y se lee tal cual (O'Higgins)", async () => {
    const c = await cliente(ip());
    await nuevoUsuario(c);
    const texto = `Fuimos a la sucursal de O'Higgins y el plato "del día" estaba muy rico ${Date.now()}`;
    const r = await c.post('/api/v1/restaurantes/1/comentarios', { comentario: texto });
    assert.strictEqual(r.status, 201);
    const lista = await c.get('/api/v1/restaurantes/1/comentarios?porPagina=50');
    assert.ok(lista.body.datos.some((x) => x.comentario === texto), 'el texto se guardó sin alterar');
  });

  test("buscar con apóstrofo funciona y una inyección no cambia la consulta", async () => {
    const c = await cliente(ip());
    const legitimo = await c.get(`/api/v1/platos/buscar?q=${encodeURIComponent("d'agua")}`);
    assert.strictEqual(legitimo.status, 200);
    const inyeccion = await c.get(`/api/v1/platos/buscar?q=${encodeURIComponent("x' OR '1'='1")}`);
    assert.strictEqual(inyeccion.status, 200);
    assert.strictEqual(inyeccion.body.datos.length, 0, 'se buscó el texto literal, no se alteró el WHERE');
  });
});

describe('ASVS V8 · Autorización (8.2.2 a nivel de registro, 8.2.1 por función)', () => {
  test('dos clientes: cada uno ve y cancela solo SUS pedidos y sesiones', async () => {
    const ana = await cliente(ip());
    await nuevoUsuario(ana);
    const beto = await cliente(ip());
    await nuevoUsuario(beto);
    const plato = await primerPlato(ana);
    await ana.post('/api/v1/restaurantes/1/carrito', { itemId: plato.id, cantidad: 1 });
    const pedido = (await ana.post('/api/v1/restaurantes/1/pedidos', {})).body.datos;

    // Registro propio: Ana lo ve en su historial.
    const propios = await ana.get('/api/v1/mis-pedidos');
    assert.ok(propios.body.datos.some((p) => p.codigo === pedido.codigo));
    // Registro ajeno: Beto no lo ve en su historial ni puede cancelarlo.
    const deBeto = await beto.get('/api/v1/mis-pedidos');
    assert.ok(!deBeto.body.datos.some((p) => p.codigo === pedido.codigo));
    assert.strictEqual((await beto.post(`/api/v1/pedidos/${pedido.codigo}/cancelar`)).status, 403);

    // Sesión ajena: Beto no puede cerrar la sesión de Ana.
    const sesionAna = (await ana.get('/api/v1/auth/sesiones')).body.datos[0].id;
    assert.strictEqual((await beto.delete(`/api/v1/auth/sesiones/${sesionAna}`)).status, 404);
    assert.strictEqual((await ana.get('/api/v1/auth/yo')).status, 200, 'la sesión de Ana sigue viva');
  });

  test('un cliente no puede ejecutar una acción reservada al rol admin', async () => {
    const c = await cliente(ip());
    await nuevoUsuario(c);
    const plato = await primerPlato(c);
    const r = await c.patch(`/api/v1/admin/items/${plato.id}`, { precio: 1 });
    assert.strictEqual(r.status, 403);
    const despues = await primerPlato(c);
    assert.strictEqual(despues.precio, plato.precio, 'el precio no cambió');
  });
});

describe('ASVS V6 + V7 · Autenticación y sesión', () => {
  test('antes de iniciar sesión 401, durante 200, después de cerrarla 401 (aunque se reuse la cookie)', async () => {
    const c = await cliente(ip());
    assert.strictEqual((await c.get('/api/v1/auth/yo')).status, 401, 'antes');

    await nuevoUsuario(c);
    const durante = await c.get('/api/v1/auth/yo');
    assert.strictEqual(durante.status, 200, 'durante');
    const cookieSesion = durante.request.cookies;
    assert.match(String(cookieSesion), /carta\.sid=/);

    assert.strictEqual((await c.post('/api/v1/auth/logout')).status, 200);
    assert.strictEqual((await c.get('/api/v1/auth/yo')).status, 401, 'después');

    // Reutilizar la cookie vieja tampoco sirve: la sesión se destruyó en el servidor.
    const request = require('supertest');
    const viejo = await request(app).get('/api/v1/auth/yo').set('Accept', 'application/json').set('Cookie', String(cookieSesion));
    assert.strictEqual(viejo.status, 401);
  });

  test('la sesión cambia de identificador al iniciar sesión (fijación de sesión, ASVS 7.2.4)', async () => {
    const c = await cliente(ip());
    const sid = (r) => (/carta\.sid=([^;]+)/.exec(String(r.request.cookies)) || [])[1];
    const antes = sid(await c.get('/api/v1/auth/csrf'));
    await nuevoUsuario(c);
    const despues = sid(await c.get('/api/v1/auth/yo'));
    assert.ok(antes && despues, 'hay cookie de sesión antes y después');
    assert.notStrictEqual(antes, despues);
  });
});

describe('ASVS 16.5.1 · Manejo de errores ante una falla de la base de datos', () => {
  test('la falla responde 500 genérico, sin traza ni credenciales', async () => {
    const c = await cliente(ip());
    const original = pool.query;
    pool.query = async () => {
      const err = new Error('connect ECONNREFUSED carta-qa-db:5432 password=SuperSecreta123 user=cartaadmin');
      err.code = 'ECONNREFUSED';
      throw err;
    };
    let r;
    try {
      r = await c.get('/api/v1/restaurantes');
    } finally {
      pool.query = original;
    }
    assert.strictEqual(r.status, 500);
    assert.strictEqual(r.body.ok, false);
    assert.ok(r.body.requestId, 'trae un identificador para buscar el error en los logs');
    const cuerpo = JSON.stringify(r.body);
    for (const prohibido of ['SuperSecreta123', 'cartaadmin', 'ECONNREFUSED', 'carta-qa-db', 'at ', '.js:']) {
      assert.ok(!cuerpo.includes(prohibido), `la respuesta no debe incluir "${prohibido}"`);
    }
    // Y la app sigue funcionando cuando la base vuelve.
    assert.strictEqual((await c.get('/api/v1/restaurantes')).status, 200);
  });
});

describe('ASVS 16.3.1 · Registro de inicios de sesión', () => {
  test('quedan registrados el éxito y el fallo con fecha, evento y resultado, sin contraseñas', async () => {
    const email = unico('registro');
    const password = 'ClaveDelRegistro2026';
    const u = await Usuario.crear({ nombre: 'Registro', email, passwordHash: await Auth.hashear(password), rol: 'cliente' });
    const c = await cliente(ip());
    assert.strictEqual((await c.login(email, 'ClaveIncorrecta999')).status, 401);
    assert.strictEqual((await c.login(email, password)).status, 200);

    const { rows } = await pool.query(
      `SELECT accion, creado, ip, detalle FROM auditoria WHERE (usuario_id = $1 OR detalle->>'email' = $2)
         AND accion IN ('login_ok', 'login_fallido') ORDER BY id`,
      [u.id, email]
    );
    const acciones = rows.map((x) => x.accion);
    assert.deepStrictEqual(acciones, ['login_fallido', 'login_ok']);
    for (const fila of rows) {
      assert.ok(fila.creado instanceof Date, 'tiene fecha');
      assert.ok(fila.ip, 'tiene IP de origen');
      const texto = JSON.stringify(fila.detalle);
      assert.ok(!texto.includes(password) && !texto.includes('ClaveIncorrecta999'), 'nunca guarda contraseñas');
      assert.ok(!/hash|\$2[aby]\$/.test(texto), 'ni hashes');
    }
  });
});
