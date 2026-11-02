// Pruebas automáticas de funcionalidad y seguridad.
// Repiten contra la app nueva los ataques que funcionaban en el PHP original.
//
// Requieren una BD de desarrollo/QA con los datos de ejemplo cargados (.env).
// Para las pruebas con login, crea un usuario de prueba y define:
//   TEST_EMAIL=...  TEST_PASSWORD=...  npm test
const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/config/db');

const { TEST_EMAIL, TEST_PASSWORD } = process.env;
const conLogin = { skip: !TEST_EMAIL || !TEST_PASSWORD ? 'define TEST_EMAIL y TEST_PASSWORD' : false };

async function nuevoAgente() {
  const agente = request.agent(app);
  const res = await agente.get('/restaurantes/1');
  const csrf = /name="csrf-token" content="([a-f0-9]+)"/.exec(res.text)[1];
  const sid = /carta\.sid=([^;]+)/.exec((res.headers['set-cookie'] || []).join(';'))?.[1];
  return { agente, csrf, sid };
}

async function iniciarSesion(agente, csrf) {
  return agente.post('/login').type('form').send({ _csrf: csrf, email: TEST_EMAIL, password: TEST_PASSWORD, volver: '/restaurantes/1' });
}

after(() => pool.end());

describe('Carta', () => {
  test('muestra la carta del restaurante', async () => {
    const res = await request(app).get('/restaurantes/1');
    assert.strictEqual(res.status, 200);
    assert.match(res.text, /Afríca Restobar/);
    assert.match(res.text, /Lomo a lo Pobre/);
  });

  test('no muestra ítems eliminados', async () => {
    const res = await request(app).get('/restaurantes/1');
    assert.doesNotMatch(res.text, /Porotos Granados/);
  });

  test('healthcheck responde', async () => {
    const res = await request(app).get('/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.estado, 'ok');
  });
});

describe('Inyección SQL (VUL: index.php?id=)', () => {
  for (const payload of ["1 OR 1=1", "1'--", '1 UNION SELECT 1,2,3', '-1', '99999999999']) {
    test(`id malicioso "${payload}" -> 404 sin errores de SQL`, async () => {
      const res = await request(app).get(`/restaurantes/${encodeURIComponent(payload)}`);
      assert.strictEqual(res.status, 404);
      assert.doesNotMatch(res.text, /syntax|postgres|sql|stack/i);
    });
  }

  test('itemId malicioso en el carrito -> 400', async () => {
    const { agente, csrf } = await nuevoAgente();
    const res = await agente.post('/restaurantes/1/carrito').set('X-CSRF-Token', csrf).send({ itemId: '1 OR 1=1' });
    assert.strictEqual(res.status, 400);
  });
});

describe('CSRF', () => {
  test('POST sin token es rechazado', async () => {
    const { agente } = await nuevoAgente();
    const res = await agente.post('/restaurantes/1/carrito').send({ itemId: 5 });
    assert.strictEqual(res.status, 403);
  });

  test('POST con token falso es rechazado', async () => {
    const { agente } = await nuevoAgente();
    const res = await agente.post('/restaurantes/1/carrito').set('X-CSRF-Token', 'a'.repeat(64)).send({ itemId: 5 });
    assert.strictEqual(res.status, 403);
  });
});

describe('Carrito', () => {
  test('agrega un producto y el precio viene de la BD', async () => {
    const { agente, csrf } = await nuevoAgente();
    const add = await agente.post('/restaurantes/1/carrito').set('X-CSRF-Token', csrf).send({ itemId: 5, precio: 1 });
    assert.strictEqual(add.status, 200);
    assert.strictEqual(add.body.enCarrito, 1);
    const ver = await agente.get('/restaurantes/1/carrito');
    assert.match(ver.text, /12\.500/); // precio real, ignora el "precio: 1" enviado
  });

  test('no permite agregar un producto de otro restaurante', async () => {
    const { agente, csrf } = await nuevoAgente();
    const res = await agente.post('/restaurantes/2/carrito').set('X-CSRF-Token', csrf).send({ itemId: 5 });
    assert.strictEqual(res.status, 400);
  });

  test('vaciar el carrito no cierra la sesión del usuario', async () => {
    const { agente, csrf } = await nuevoAgente();
    await agente.post('/restaurantes/1/carrito').set('X-CSRF-Token', csrf).send({ itemId: 5 });
    await agente.post('/restaurantes/1/carrito/vaciar').type('form').send({ _csrf: csrf });
    const res = await agente.post('/restaurantes/1/carrito').set('X-CSRF-Token', csrf).send({ itemId: 5 });
    assert.strictEqual(res.status, 200); // el token CSRF sigue siendo válido: la sesión sigue viva
    assert.strictEqual(res.body.enCarrito, 1);
  });
});

describe('Control de acceso', () => {
  test('comentar sin sesión -> 401', async () => {
    const { agente, csrf } = await nuevoAgente();
    const res = await agente.post('/restaurantes/1/comentarios').type('form').send({ _csrf: csrf, comentario: 'hola' });
    assert.strictEqual(res.status, 401);
  });

  test('logout por GET no existe (evita CSRF por enlace)', async () => {
    const res = await request(app).get('/logout');
    assert.strictEqual(res.status, 404);
  });
});

describe('Login', () => {
  test('credenciales incorrectas -> mensaje genérico', async () => {
    const { agente, csrf } = await nuevoAgente();
    const res = await agente.post('/login').type('form').send({ _csrf: csrf, email: 'noexiste@x.cl', password: "' OR '1'='1", volver: '/restaurantes/1' });
    assert.strictEqual(res.status, 302);
    const pagina = await agente.get('/restaurantes/1');
    assert.match(pagina.text, /Correo o contraseña incorrectos/);
    assert.doesNotMatch(pagina.text, /Cerrar sesión/);
  });

  test('no permite redirección abierta tras login', async () => {
    const { agente, csrf } = await nuevoAgente();
    const res = await agente.post('/login').type('form').send({ _csrf: csrf, email: 'a@b.cl', password: 'x', volver: '//sitio-malicioso.com' });
    assert.strictEqual(res.headers.location, '/');
  });

  test('login correcto cambia el id de sesión (anti fijación)', conLogin, async () => {
    const { agente, csrf, sid: antes } = await nuevoAgente();
    assert.ok(antes);
    const res = await iniciarSesion(agente, csrf);
    assert.strictEqual(res.status, 302);
    const nueva = /carta\.sid=([^;]+)/.exec(res.headers['set-cookie'].join(';'))[1];
    assert.notStrictEqual(nueva, antes);
  });
});

describe('XSS almacenado en comentarios', () => {
  test('el comentario se muestra escapado', conLogin, async () => {
    let { agente, csrf } = await nuevoAgente();
    await iniciarSesion(agente, csrf);
    csrf = /name="csrf-token" content="([a-f0-9]+)"/.exec((await agente.get('/restaurantes/1')).text)[1];

    const payload = `<script>alert('xss-${Date.now()}')</script>`;
    const res = await agente.post('/restaurantes/1/comentarios').type('form').send({ _csrf: csrf, comentario: payload });
    assert.strictEqual(res.status, 302);

    const pagina = await agente.get('/restaurantes/1');
    assert.ok(!pagina.text.includes(payload), 'el script no debe aparecer sin escapar');
    assert.ok(pagina.text.includes('&lt;script&gt;'), 'debe aparecer escapado');
  });
});

describe('Cabeceras de seguridad', () => {
  test('CSP, anti-clickjacking, nosniff y cookie HttpOnly', async () => {
    const res = await request(app).get('/restaurantes/1');
    assert.match(res.headers['content-security-policy'], /script-src 'self'/);
    assert.match(res.headers['content-security-policy'], /frame-ancestors 'none'/);
    assert.strictEqual(res.headers['x-content-type-options'], 'nosniff');
    assert.strictEqual(res.headers['x-powered-by'], undefined);
    assert.match(res.headers['set-cookie'].join(';'), /HttpOnly/);
    assert.match(res.headers['set-cookie'].join(';'), /SameSite=Lax/);
  });

  test('errores sin stack trace', async () => {
    const res = await request(app).get('/no-existe');
    assert.strictEqual(res.status, 404);
    assert.doesNotMatch(res.text, /at \w+ \(|node_modules/);
  });
});

describe('Fuerza bruta', () => {
  test('bloquea el login tras 5 intentos fallidos', async () => {
    const { agente, csrf } = await nuevoAgente();
    let ultimo;
    for (let i = 0; i < 7; i++) {
      ultimo = await agente.post('/login').type('form').send({ _csrf: csrf, email: 'ataque@x.cl', password: `intento${i}` });
    }
    assert.strictEqual(ultimo.status, 429);
  });
});
