// Router de la API REST: /api/v1
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const config = require('../config/env');
const aw = require('../utils/async');
const { validar } = require('./validar');
const { requiereLogin, requiereAdmin } = require('./acceso');
const { limiteApi } = require('../middlewares/limites');
const { ok, httpError } = require('../utils/http');
const rutas = require('./rutas');
const openapi = require('./openapi');

const router = express.Router();
const v1 = express.Router();

// Las respuestas de la API son datos de la sesión: no se guardan en caché.
v1.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
v1.use(limiteApi);

const ACCESO = { login: requiereLogin, admin: aw(requiereAdmin) };

for (const r of rutas) {
  const cadena = [];
  if (r.limite) cadena.push(r.limite);
  if (ACCESO[r.acceso]) cadena.push(ACCESO[r.acceso]);
  cadena.push(validar({ params: r.params, query: r.query, body: r.body }));
  cadena.push(aw(r.h));
  v1[r.metodo](r.ruta, ...cadena);
}

const especificacion = openapi.generar();

v1.get('/', (req, res) =>
  ok(res, {
    nombre: especificacion.info.title,
    version: especificacion.info.version,
    documentacion: config.apiDocs ? '/api/docs' : null,
    openapi: config.apiDocs ? '/api/v1/openapi.json' : null,
    endpoints: rutas.length,
  })
);

if (config.apiDocs) {
  v1.get('/openapi.json', (req, res) => res.json(especificacion));
}

// Cualquier otra ruta de la API: 404 en JSON (no la página HTML de la web).
v1.use((req, res, next) => next(httpError(404, 'Endpoint no encontrado')));

router.use('/api/v1', v1);

if (config.apiDocs) {
  // Swagger UI usa estilos inline: se relaja la CSP SOLO en esta página.
  router.use(
    '/api/docs',
    (req, res, next) => {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; form-action 'self'"
      );
      next();
    },
    swaggerUi.serveFiles(especificacion),
    swaggerUi.setup(especificacion, {
      customSiteTitle: 'Carta Digital — API',
      swaggerOptions: { persistAuthorization: true, withCredentials: true, docExpansion: 'list', tagsSorter: 'alpha' },
    })
  );
}

module.exports = router;
