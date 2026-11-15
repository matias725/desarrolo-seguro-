// Límites de peticiones guardados en PostgreSQL (compartidos entre instancias).
process.env.LIMITES_STORE = 'postgres';

const { test, after, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { pool, query } = require('../src/config/db');
const { LimiteStorePg } = require('../src/middlewares/limiteStorePg');

after(() => pool.end());
before(() => query("DELETE FROM limites_peticiones WHERE clave LIKE 'login:%' OR clave LIKE 'prueba-%'"));

test('dos instancias comparten el mismo contador', async () => {
  const prefijo = `prueba-${Date.now()}`;
  const instanciaA = new LimiteStorePg(prefijo);
  const instanciaB = new LimiteStorePg(prefijo);
  instanciaA.init({ windowMs: 60000 });
  instanciaB.init({ windowMs: 60000 });
  await instanciaA.increment('203.0.113.7');
  await instanciaB.increment('203.0.113.7');
  const r = await instanciaA.increment('203.0.113.7');
  assert.strictEqual(r.totalHits, 3, 'la instancia A ve los intentos hechos en la B');
  await instanciaB.resetKey('203.0.113.7');
  assert.strictEqual((await instanciaA.increment('203.0.113.7')).totalHits, 1);
});

test('la ventana vencida reinicia el contador', async () => {
  const s = new LimiteStorePg(`prueba-v-${Date.now()}`);
  s.init({ windowMs: 300 });
  await s.increment('ip');
  await s.increment('ip');
  await new Promise((r) => setTimeout(r, 400));
  assert.strictEqual((await s.increment('ip')).totalHits, 1);
});

test('fuerza bruta en el login: 429 y el contador queda en la BD', async () => {
  const app = require('../src/app');
  const c = request.agent(app);
  const csrf = (await c.get('/api/v1/auth/csrf')).body.datos.csrfToken;
  let ultimo;
  for (let i = 0; i < 6; i++) {
    ultimo = await c.post('/api/v1/auth/login').set('X-CSRF-Token', csrf).send({ email: `pg${i}-${Date.now()}@x.cl`, password: 'mala' });
  }
  assert.strictEqual(ultimo.status, 429);
  assert.strictEqual(ultimo.body.ok, false);
  const { rows } = await query("SELECT hits FROM limites_peticiones WHERE clave LIKE 'login:%'");
  assert.ok(rows.length === 1 && rows[0].hits >= 5);
});
