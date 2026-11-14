// Logs estructurados en JSON (pino). En AWS (CloudWatch) o Docker se pueden
// filtrar por campo: nivel, requestId, usuario, ruta, tiempo de respuesta...
// Nunca se registran contraseñas, cookies ni tokens (redact).
const pino = require('pino');

const nivel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : process.env.NODE_ENV === 'production' ? 'info' : 'debug');

const logger = pino({
  level: nivel,
  base: { app: 'carta-digital', ambiente: process.env.NODE_ENV || 'development' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'req.headers["x-csrf-token"]',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordActual',
      '*.passwordNueva',
      '*.password_hash',
    ],
    censor: '[oculto]',
  },
});

module.exports = logger;
