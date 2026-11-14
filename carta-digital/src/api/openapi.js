// Genera la especificación OpenAPI 3.1 a partir de src/api/rutas.js y de los
// esquemas Zod (z.toJSONSchema). Se sirve en /api/v1/openapi.json y /api/docs.
const { z } = require('zod');
const rutas = require('./rutas');
const pkg = require('../../package.json');

const aJsonSchema = (esquema) => z.toJSONSchema(esquema, { io: 'input', unrepresentable: 'any', target: 'openapi-3.0' });

const ERROR = {
  type: 'object',
  properties: {
    ok: { type: 'boolean', example: false },
    error: { type: 'string' },
    detalles: { type: 'array', items: { type: 'object', properties: { campo: { type: 'string' }, mensaje: { type: 'string' } } } },
  },
};

const respuestaError = (descripcion) => ({ description: descripcion, content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } });

function parametros(esquema, ubicacion) {
  if (!esquema) return [];
  const json = aJsonSchema(esquema);
  const requeridos = new Set(json.required || []);
  return Object.entries(json.properties || {}).map(([nombre, schema]) => ({
    name: nombre,
    in: ubicacion,
    required: ubicacion === 'path' || (requeridos.has(nombre) && schema.default === undefined),
    schema,
  }));
}

function generar() {
  const paths = {};
  for (const r of rutas) {
    const ruta = r.ruta.replace(/:(\w+)/g, '{$1}');
    const mutante = r.metodo !== 'get';
    const seguridad = [];
    if (r.acceso === 'login' || r.acceso === 'admin') seguridad.push('sesion');
    if (mutante) seguridad.push('csrf');

    const op = {
      tags: [r.tag],
      summary: r.resumen,
      description: [r.descripcion, r.acceso === 'admin' ? '🔒 Requiere rol **admin**.' : r.acceso === 'login' ? '🔒 Requiere sesión iniciada.' : null]
        .filter(Boolean)
        .join('\n\n') || undefined,
      operationId: `${r.metodo}${ruta.replace(/[{}]/g, '').replace(/\/(\w)/g, (_, c) => c.toUpperCase()).replace(/[^\w]/g, '')}`,
      parameters: [...parametros(r.params, 'path'), ...parametros(r.query, 'query')],
      security: seguridad.length ? [Object.fromEntries(seguridad.map((s) => [s, []]))] : [],
      responses: {
        [r.status || 200]: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Respuesta' } } } },
        400: respuestaError('Datos inválidos'),
        ...(seguridad.includes('sesion') ? { 401: respuestaError('Sin sesión') } : {}),
        ...(mutante || r.acceso === 'admin' ? { 403: respuestaError('Token CSRF inválido o sin permisos') } : {}),
        ...(r.params ? { 404: respuestaError('No encontrado') } : {}),
        ...(r.limite ? { 429: respuestaError('Demasiadas peticiones') } : {}),
      },
    };
    if (r.body) {
      op.requestBody = { required: true, content: { 'application/json': { schema: aJsonSchema(r.body) } } };
    }
    paths[ruta] = { ...(paths[ruta] || {}), [r.metodo]: op };
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'Carta Digital — API REST',
      version: pkg.version,
      description: [
        'API de la carta digital de restaurantes (Node.js + Express + PostgreSQL).',
        '',
        '**Cómo probarla aquí:**',
        '1. `GET /auth/csrf` → copia `csrfToken`.',
        '2. Botón **Authorize** → pega el token en `csrf`.',
        '3. `POST /auth/login` (o `/auth/registro`) → copia el nuevo `csrfToken` de la respuesta y vuelve a autorizar.',
        '',
        'La sesión viaja en la cookie `carta.sid` (HttpOnly), compartida con la web: el carrito es el mismo.',
        'Todas las respuestas tienen la forma `{ ok, datos, paginacion? }` o `{ ok: false, error, detalles? }`.',
      ].join('\n'),
    },
    servers: [{ url: '/api/v1' }],
    tags: [...new Set(rutas.map((r) => r.tag))].map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        sesion: { type: 'apiKey', in: 'cookie', name: 'carta.sid', description: 'Cookie de sesión (la pone el navegador al iniciar sesión)' },
        csrf: { type: 'apiKey', in: 'header', name: 'X-CSRF-Token', description: 'Token de GET /auth/csrf o de la respuesta de login' },
      },
      schemas: {
        Respuesta: { type: 'object', properties: { ok: { type: 'boolean', example: true }, datos: {}, paginacion: { type: 'object' } } },
        Error: ERROR,
      },
    },
  };
}

module.exports = { generar };
