// Pruebas de la API REST v1 (funcionalidad + seguridad).
// Requieren una BD de desarrollo/QA con los datos de ejemplo y la migración v2.
//   TEST_EMAIL / TEST_PASSWORD               -> usuario cliente
//   TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD   -> usuario admin (npm run crear-admin)
// Las pruebas crean registros (pedidos, comentarios, platos): NO correr en producción.
// Este archivo registra varias cuentas: se sube el límite de registros por IP
// solo para este proceso de pruebas (el límite real se prueba más abajo).
process.env.LIMITE_REGISTRO_HORA = '100';

const { test, describe, after, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/config/db');

const { TEST_EMAIL, TEST_PASSWORD, TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD } = process.env;
const conCliente = { skip: !TEST_EMAIL || !TEST_PASSWORD ? 'define TEST_EMAIL y TEST_PASSWORD' : false };
const conAdmin = { skip: !TEST_ADMIN_EMAIL || !TEST_ADMIN_PASSWORD ? 'define TEST_ADMIN_EMAIL y TEST_ADMIN_PASSWORD' : false };

after(() => pool.end());

// Cliente de la API con su propia sesión y token CSRF.
async function cliente() {
  const agente = request.agent(app);
  const res = await agente.get('/api/v1/auth/csrf');
  const c = { agente, csrf: res.body.datos.csrfToken };
  const enviar = (metodo) => (url, cuerpo) => {
    const r = c.agente[metodo](url).set('X-CSRF-Token', c.csrf).set('Accept', 'application/json');
    return cuerpo === undefined ? r : r.send(cuerpo);
  };
  c.post = enviar('post');
  c.patch = enviar('patch');
  c.delete = enviar('delete');
  c.get = (url) => c.agente.get(url);
  c.login = async (email, password) => {
    const r = await c.post('/api/v1/auth/login', { email, password });
    if (r.body.datos && r.body.datos.csrfToken) c.csrf = r.body.datos.csrfToken;
    return r;
  };
  return c;
}

describe('API pública', () => {
  test('índice de la API', async () => {
    const res = await request(app).get('/api/v1');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.datos.endpoints > 30);
  });

  test('lista restaurantes con paginación', async () => {
    const res = await request(app).get('/api/v1/restaurantes?porPagina=2');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.datos.length, 2);
    assert.strictEqual(res.body.paginacion.porPagina, 2);
    assert.ok(res.body.paginacion.total >= 2);
  });

  test('busca restaurantes por nombre', async () => {
    const res = await request(app).get('/api/v1/restaurantes?q=afr');
    assert.ok(res.body.datos.some((r) => r.nombre === 'Afríca Restobar'));
  });

  test('detalle con resumen y dirección', async () => {
    const res = await request(app).get('/api/v1/restaurantes/1');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.datos.direccion.comuna, 'La Serena');
    assert.ok(res.body.datos.resumen.platos > 0);
  });

  test('carta completa anidada sin ítems eliminados', async () => {
    const res = await request(app).get('/api/v1/restaurantes/1/carta');
    const nombres = res.body.datos.flatMap((c) => c.categorias.flatMap((cat) => cat.items.map((i) => i.nombre)));
    assert.ok(nombres.includes('Lomo a lo Pobre'));
    assert.ok(!nombres.includes('Porotos Granados'));
  });

  test('filtra platos por precio y ordena', async () => {
    const res = await request(app).get('/api/v1/restaurantes/1/platos?precioMax=10000&orden=precio_desc');
    assert.strictEqual(res.status, 200);
    const precios = res.body.datos.map((p) => p.precio);
    assert.ok(precios.every((p) => p <= 10000));
    assert.deepStrictEqual(precios, [...precios].sort((a, b) => b - a));
  });

  test('búsqueda global de platos exige 2 caracteres', async () => {
    assert.strictEqual((await request(app).get('/api/v1/platos/buscar?q=a')).status, 400);
    const res = await request(app).get('/api/v1/platos/buscar?q=lomo');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.datos.every((p) => p.restaurante));
  });

  test('restaurante inexistente -> 404 JSON', async () => {
    const res = await request(app).get('/api/v1/restaurantes/99999');
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.ok, false);
  });

  test('endpoint inexistente -> 404 JSON (no HTML)', async () => {
    const res = await request(app).get('/api/v1/no-existe');
    assert.strictEqual(res.status, 404);
    assert.match(res.headers['content-type'], /json/);
  });

  test('documentación OpenAPI disponible', async () => {
    const res = await request(app).get('/api/v1/openapi.json');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.paths['/restaurantes/{id}/pedidos'].post);
  });
});

describe('API: seguridad de entrada', () => {
  for (const payload of ['1 OR 1=1', "1'--", '-1', '1.5', '99999999999']) {
    test(`id malicioso "${payload}" -> 404`, async () => {
      const res = await request(app).get(`/api/v1/restaurantes/${encodeURIComponent(payload)}`);
      assert.strictEqual(res.status, 404);
      assert.doesNotMatch(JSON.stringify(res.body), /syntax|postgres|sql|stack/i);
    });
  }

  test('parámetro de búsqueda desconocido -> 400', async () => {
    const res = await request(app).get('/api/v1/restaurantes?orden=1;DROP TABLE');
    assert.strictEqual(res.status, 400);
  });

  test('comodines de LIKE se buscan literalmente', async () => {
    const res = await request(app).get('/api/v1/restaurantes?q=%25');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.datos.length, 0);
  });

  test('POST sin token CSRF -> 403', async () => {
    const res = await request(app).post('/api/v1/restaurantes/1/carrito').send({ itemId: 5 });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.ok, false);
  });

  test('cuerpo que no es JSON -> 415', async () => {
    const c = await cliente();
    const res = await c.agente.post('/api/v1/restaurantes/1/carrito').set('X-CSRF-Token', c.csrf).type('form').send({ itemId: 5 });
    assert.strictEqual(res.status, 415);
  });

  test('JSON malformado -> 400 sin detalles internos', async () => {
    const c = await cliente();
    const res = await c.agente.post('/api/v1/restaurantes/1/carrito').set('X-CSRF-Token', c.csrf).set('Content-Type', 'application/json').send('{"itemId":');
    assert.strictEqual(res.status, 400);
    assert.doesNotMatch(JSON.stringify(res.body), /at |node_modules/);
  });

  test('registro con rol admin es rechazado (mass assignment)', async () => {
    const c = await cliente();
    const res = await c.post('/api/v1/auth/registro', { nombre: 'Hacker', email: `h${Date.now()}@x.cl`, password: 'ClaveSegura123', rol: 'admin' });
    assert.strictEqual(res.status, 400);
    assert.match(JSON.stringify(res.body.detalles), /rol/);
  });

  test('registro con contraseña débil -> 400 con detalle', async () => {
    const c = await cliente();
    const res = await c.post('/api/v1/auth/registro', { nombre: 'Ana', email: `a${Date.now()}@x.cl`, password: '123' });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.detalles[0].campo, 'password');
  });

  test('cabeceras: no-store, X-Request-Id y CSP', async () => {
    const res = await request(app).get('/api/v1/restaurantes');
    assert.strictEqual(res.headers['cache-control'], 'no-store');
    assert.ok(res.headers['x-request-id']);
    assert.match(res.headers['content-security-policy'], /default-src 'self'/);
  });
});

describe('API: carrito y pedidos', () => {
  test('el carrito usa precios de la BD y respeta límites', async () => {
    const c = await cliente();
    let res = await c.post('/api/v1/restaurantes/1/carrito', { itemId: 5, cantidad: 2 });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.datos.total, 25000);
    res = await c.patch('/api/v1/restaurantes/1/carrito/5', { cantidad: 99 });
    assert.strictEqual(res.status, 400);
    res = await c.patch('/api/v1/restaurantes/1/carrito/5', { cantidad: 1 });
    assert.strictEqual(res.body.datos.cantidad, 1);
    res = await c.delete('/api/v1/restaurantes/1/carrito/5');
    assert.strictEqual(res.body.datos.lineas.length, 0);
  });

  test('producto de otro restaurante -> 400', async () => {
    const c = await cliente();
    const res = await c.post('/api/v1/restaurantes/2/carrito', { itemId: 5 });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'Producto no disponible');
  });

  test('la web y la API comparten el carrito', async () => {
    const c = await cliente();
    await c.post('/restaurantes/1/carrito', { itemId: 5 }); // ruta web (fetch de app.js)
    const res = await c.get('/api/v1/restaurantes/1/carrito');
    assert.strictEqual(res.body.datos.cantidad, 1);
  });

  test('pedido desde el carrito: total calculado en el servidor, carrito vaciado', async () => {
    const c = await cliente();
    await c.post('/api/v1/restaurantes/1/carrito', { itemId: 5, cantidad: 2 });
    const res = await c.post('/api/v1/restaurantes/1/pedidos', { mesa: '7', nota: 'Sin sal' });
    assert.strictEqual(res.status, 201);
    assert.match(res.body.datos.codigo, /^[A-Z2-9]{8}$/);
    assert.strictEqual(res.body.datos.total, 25000);
    assert.strictEqual(res.body.datos.estado, 'pendiente');
    assert.strictEqual(res.body.datos.usuario_id, undefined); // sin datos personales
    const carrito = await c.get('/api/v1/restaurantes/1/carrito');
    assert.strictEqual(carrito.body.datos.cantidad, 0);
  });

  test('pedido con precio manipulado: se ignora (campo no permitido)', async () => {
    const c = await cliente();
    const res = await c.post('/api/v1/restaurantes/1/pedidos', { items: [{ itemId: 5, cantidad: 1, precio: 1 }] });
    assert.strictEqual(res.status, 400);
  });

  test('pedido vacío -> 400', async () => {
    const c = await cliente();
    const res = await c.post('/api/v1/restaurantes/1/pedidos', {});
    assert.strictEqual(res.status, 400);
  });

  test('seguimiento por código y cancelación solo por el dueño', async () => {
    const dueno = await cliente();
    const { body } = await dueno.post('/api/v1/restaurantes/1/pedidos', { items: [{ itemId: 5, cantidad: 1 }] });
    const codigo = body.datos.codigo;

    const otro = await cliente();
    assert.strictEqual((await otro.get(`/api/v1/pedidos/${codigo}`)).status, 200);
    assert.strictEqual((await otro.post(`/api/v1/pedidos/${codigo}/cancelar`)).status, 403);

    const cancelado = await dueno.post(`/api/v1/pedidos/${codigo}/cancelar`);
    assert.strictEqual(cancelado.status, 200);
    assert.strictEqual(cancelado.body.datos.estado, 'cancelado');
    assert.strictEqual((await dueno.post(`/api/v1/pedidos/${codigo}/cancelar`)).status, 409);
  });

  test('código de pedido con formato inválido -> 404', async () => {
    const res = await request(app).get("/api/v1/pedidos/' OR 1=1--");
    assert.strictEqual(res.status, 404);
  });
});

describe('API: autenticación', () => {
  test('registro, sesión, cambio de contraseña y logout', async () => {
    const c = await cliente();
    const email = `nuevo${Date.now()}@carta.test`;
    let res = await c.post('/api/v1/auth/registro', { nombre: 'Nuevo Cliente', email, password: 'MiClaveSegura1' });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.datos.usuario.rol, 'cliente');
    c.csrf = res.body.datos.csrfToken;

    res = await c.get('/api/v1/auth/yo');
    assert.strictEqual(res.body.datos.email, email);

    res = await c.patch('/api/v1/auth/yo/password', { passwordActual: 'incorrecta1', passwordNueva: 'OtraClave1234' });
    assert.strictEqual(res.status, 400);
    res = await c.patch('/api/v1/auth/yo/password', { passwordActual: 'MiClaveSegura1', passwordNueva: 'OtraClave1234' });
    assert.strictEqual(res.status, 200);
    c.csrf = res.body.datos.csrfToken;

    res = await c.post('/api/v1/auth/logout');
    assert.strictEqual(res.status, 200);
    assert.strictEqual((await c.get('/api/v1/auth/yo')).status, 401);

    const otro = await cliente();
    assert.strictEqual((await otro.login(email, 'OtraClave1234')).status, 200);
  });

  test('correo duplicado -> 409', async () => {
    const c = await cliente();
    const email = `dup${Date.now()}@carta.test`;
    await c.post('/api/v1/auth/registro', { nombre: 'Uno', email, password: 'ClaveSegura12' });
    const otro = await cliente();
    const res = await otro.post('/api/v1/auth/registro', { nombre: 'Dos', email, password: 'ClaveSegura12' });
    assert.strictEqual(res.status, 409);
  });

  test('login incorrecto -> 401 genérico', async () => {
    const c = await cliente();
    const res = await c.login('noexiste@x.cl', "' OR '1'='1");
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error, 'Correo o contraseña incorrectos');
  });

  test('comentar por API con sesión y verlo escapado en la web', conCliente, async () => {
    const c = await cliente();
    await c.login(TEST_EMAIL, TEST_PASSWORD);
    const payload = `<img src=x onerror=alert(${Date.now()})>`;
    const res = await c.post('/api/v1/restaurantes/1/comentarios', { comentario: payload });
    assert.strictEqual(res.status, 201);
    const pagina = await request(app).get('/restaurantes/1');
    assert.ok(!pagina.text.includes(payload));
  });

  test('cliente no puede usar endpoints de admin -> 403', conCliente, async () => {
    const c = await cliente();
    await c.login(TEST_EMAIL, TEST_PASSWORD);
    assert.strictEqual((await c.get('/api/v1/admin/pedidos')).status, 403);
    assert.strictEqual((await c.patch('/api/v1/admin/items/5', { precio: 1 })).status, 403);
  });

  test('sin sesión los endpoints de admin -> 401', async () => {
    assert.strictEqual((await request(app).get('/api/v1/admin/estadisticas')).status, 401);
  });
});

describe('API: administración', conAdmin, () => {
  let admin;
  before(async () => {
    admin = await cliente();
    const r = await admin.login(TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD);
    assert.strictEqual(r.status, 200);
  });

  test('CRUD completo: restaurante → carta → categoría → plato', async () => {
    let res = await admin.post('/api/v1/admin/restaurantes', {
      rut: '76543210-K',
      nombre: 'Resto de Prueba',
      fono: '512345678',
      direccion: { calle: 'Av. del Mar', numero: '1000', comuna: 'La Serena', region: 'Coquimbo' },
    });
    assert.strictEqual(res.status, 201);
    const restoId = res.body.datos.id;

    res = await admin.post(`/api/v1/admin/restaurantes/${restoId}/cartas`, { nombre: 'Almuerzo' });
    assert.strictEqual(res.status, 201);
    const cartaId = res.body.datos.id;

    res = await admin.post(`/api/v1/admin/cartas/${cartaId}/categorias`, { nombre: 'Fondos' });
    const catId = res.body.datos.id;

    res = await admin.post(`/api/v1/admin/categorias/${catId}/items`, { nombre: 'Pescado frito', precio: 8900, destacado: true });
    assert.strictEqual(res.status, 201);
    const itemId = res.body.datos.id;

    // Aparece en la API pública y en la web
    let carta = await request(app).get(`/api/v1/restaurantes/${restoId}/carta`);
    assert.strictEqual(carta.body.datos[0].categorias[0].items[0].nombre, 'Pescado frito');
    assert.match((await request(app).get(`/restaurantes/${restoId}`)).text, /Pescado frito/);

    // Editar precio y ocultar
    res = await admin.patch(`/api/v1/admin/items/${itemId}`, { precio: 9900, visible: false });
    assert.strictEqual(res.body.datos.precio, 9900);
    carta = await request(app).get(`/api/v1/restaurantes/${restoId}/carta`);
    assert.strictEqual(carta.body.datos[0].categorias[0].items.length, 0);

    // El admin sí ve lo oculto
    res = await admin.get(`/api/v1/admin/restaurantes/${restoId}`);
    assert.strictEqual(res.body.datos.cartas[0].categorias[0].items[0].visible, false);

    // Eliminar y restaurar
    assert.strictEqual((await admin.delete(`/api/v1/admin/restaurantes/${restoId}`)).status, 200);
    assert.strictEqual((await request(app).get(`/api/v1/restaurantes/${restoId}`)).status, 404);
    assert.strictEqual((await admin.post(`/api/v1/admin/restaurantes/${restoId}/restaurar`)).status, 200);
    assert.strictEqual((await request(app).get(`/api/v1/restaurantes/${restoId}`)).status, 200);
    await admin.delete(`/api/v1/admin/restaurantes/${restoId}`);
  });

  test('validación: imagen con ruta y precio negativo -> 400', async () => {
    let res = await admin.patch('/api/v1/admin/items/5', { foto: '../../etc/passwd' });
    assert.strictEqual(res.status, 400);
    res = await admin.patch('/api/v1/admin/items/5', { precio: -1 });
    assert.strictEqual(res.status, 400);
    res = await admin.patch('/api/v1/admin/items/5', { categorias_id: 2 });
    assert.strictEqual(res.status, 400);
  });

  test('flujo de estados del pedido', async () => {
    const c = await cliente();
    const { body } = await c.post('/api/v1/restaurantes/1/pedidos', { items: [{ itemId: 5, cantidad: 1 }] });
    const codigo = body.datos.codigo;
    const lista = await admin.get('/api/v1/admin/pedidos?estado=pendiente&porPagina=100');
    const id = lista.body.datos.find((p) => p.codigo === codigo).id;

    let res = await admin.patch(`/api/v1/admin/pedidos/${id}/estado`, { estado: 'entregado' });
    assert.strictEqual(res.status, 409); // no se salta estados
    for (const estado of ['preparando', 'listo', 'entregado']) {
      res = await admin.patch(`/api/v1/admin/pedidos/${id}/estado`, { estado });
      assert.strictEqual(res.status, 200);
    }
    assert.deepStrictEqual(res.body.datos.siguientesEstados, []);
    // El cliente ve el estado actualizado y ya no puede cancelar
    assert.strictEqual((await c.get(`/api/v1/pedidos/${codigo}`)).body.datos.estado, 'entregado');
    assert.strictEqual((await c.post(`/api/v1/pedidos/${codigo}/cancelar`)).status, 409);
  });

  test('moderación: un comentario oculto no aparece en la web', async () => {
    const c = await cliente();
    const email = `mod${Date.now()}@carta.test`;
    const reg = await c.post('/api/v1/auth/registro', { nombre: 'Moderado', email, password: 'ClaveSegura12' });
    c.csrf = reg.body.datos.csrfToken;
    const texto = `Spam de prueba ${Date.now()}`;
    const com = await c.post('/api/v1/restaurantes/1/comentarios', { comentario: texto });
    assert.match((await request(app).get('/restaurantes/1')).text, new RegExp(texto));

    const res = await admin.patch(`/api/v1/admin/comentarios/${com.body.datos.id}`, { oculto: true });
    assert.strictEqual(res.status, 200);
    assert.doesNotMatch((await request(app).get('/restaurantes/1')).text, new RegExp(texto));
  });

  test('desactivar usuario bloquea su login; el admin no puede desactivarse a sí mismo', async () => {
    const c = await cliente();
    const email = `baja${Date.now()}@carta.test`;
    const reg = await c.post('/api/v1/auth/registro', { nombre: 'Baja', email, password: 'ClaveSegura12' });
    const uid = reg.body.datos.usuario.id;
    assert.strictEqual((await admin.patch(`/api/v1/admin/usuarios/${uid}`, { activo: false })).status, 200);
    assert.strictEqual((await (await cliente()).login(email, 'ClaveSegura12')).status, 401);

    const yo = await admin.get('/api/v1/auth/yo');
    assert.strictEqual((await admin.patch(`/api/v1/admin/usuarios/${yo.body.datos.id}`, { activo: false })).status, 409);
  });

  test('quitar el rol admin corta el acceso al instante', async () => {
    const c = await cliente();
    const email = `adm${Date.now()}@carta.test`;
    const reg = await c.post('/api/v1/auth/registro', { nombre: 'Admin temporal', email, password: 'ClaveSegura12' });
    c.csrf = reg.body.datos.csrfToken;
    const uid = reg.body.datos.usuario.id;
    await admin.patch(`/api/v1/admin/usuarios/${uid}`, { rol: 'admin' });
    assert.strictEqual((await c.get('/api/v1/admin/estadisticas')).status, 200);
    await admin.patch(`/api/v1/admin/usuarios/${uid}`, { rol: 'cliente' });
    assert.strictEqual((await c.get('/api/v1/admin/estadisticas')).status, 403);
  });

  test('estadísticas y auditoría registran las acciones', async () => {
    const est = await admin.get('/api/v1/admin/estadisticas');
    assert.strictEqual(est.status, 200);
    assert.ok(est.body.datos.resumen.pedidos >= 1);
    assert.ok(Array.isArray(est.body.datos.platosMasPedidos));

    const aud = await admin.get('/api/v1/admin/auditoria?accion=pedido_estado');
    assert.ok(aud.body.datos.length >= 1);
    const login = await admin.get('/api/v1/admin/auditoria?accion=login_fallido');
    assert.ok(login.body.datos.length >= 1);
  });
});

// Va al final: deja la IP bloqueada para el login durante 15 minutos.
describe('API: límites', () => {
  test('el login por API comparte el límite anti fuerza bruta', async () => {
    const c = await cliente();
    let ultimo;
    for (let i = 0; i < 6; i++) ultimo = await c.login('ataque-api@x.cl', `intento${i}`);
    assert.strictEqual(ultimo.status, 429);
  });
});
