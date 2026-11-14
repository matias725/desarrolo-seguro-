// Configuración de la aplicación Express (sin levantar el servidor,
// así los tests pueden usarla directamente).
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const pinoHttp = require('pino-http');
const helmet = require('helmet');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);

const config = require('./config/env');
const { pool } = require('./config/db');
const { proteccionCsrf } = require('./middlewares/csrf');
const { usuarioEnVistas } = require('./middlewares/auth');
const { noEncontrado, manejadorErrores } = require('./middlewares/errores');
const formato = require('./utils/formato');
const logger = require('./config/logger');
const rutas = require('./routes');
const api = require('./api');

const app = express();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.set('trust proxy', /^\d+$/.test(config.trustProxy) ? Number(config.trustProxy) : config.trustProxy === 'true');
app.disable('x-powered-by');

// ---- Logs de cada petición (JSON) con un id para rastrearla.
// Si el balanceador (ALB/Cloudflare) ya manda X-Request-Id se reutiliza.
app.use(
  pinoHttp({
    logger,
    genReqId: (req, res) => {
      const recibido = req.headers['x-request-id'];
      const id = typeof recibido === 'string' && /^[\w-]{8,64}$/.test(recibido) ? recibido : crypto.randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },
    autoLogging: { ignore: (req) => req.url === '/health' || /^\/(css|js|img|imagenes)\//.test(req.url) },
    customLogLevel: (req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
    customProps: (req) => ({ usuarioId: req.session && req.session.usuario ? req.session.usuario.id : undefined }),
    serializers: {
      req: (req) => ({ id: req.id, method: req.method, url: req.url, ip: req.remoteAddress }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  })
);

// ---- Cabeceras de seguridad (CSP, HSTS, X-Frame-Options, nosniff, etc.)
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"], // sin scripts inline: mitiga XSS
        'style-src': ["'self'"],
        'font-src': ["'self'"],
        'img-src': ["'self'", 'data:'],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"], // evita clickjacking
        'upgrade-insecure-requests': config.esProduccion ? [] : null,
      },
    },
    hsts: config.esProduccion ? { maxAge: 31536000, includeSubDomains: true } : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
);

// ---- Healthcheck para Docker / balanceador (antes de sesiones: no crea cookies)
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ estado: 'ok', ambiente: config.nodeEnv });
  } catch {
    res.status(503).json({ estado: 'sin conexión a la base de datos' });
  }
});

// ---- Archivos estáticos
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: config.esProduccion ? '7d' : 0, index: false }));

// ---- Cuerpos de petición con límite de tamaño
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(express.json({ limit: '10kb' }));

// ---- Sesiones guardadas en PostgreSQL
app.use(
  session({
    name: 'carta.sid',
    store: new PgSession({ pool, tableName: 'sesiones', pruneSessionInterval: 60 * 15 }),
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true, // JavaScript no puede leer la cookie (mitiga robo por XSS)
      secure: config.esProduccion, // solo por HTTPS en producción
      sameSite: 'lax', // mitiga CSRF
      maxAge: 2 * 60 * 60 * 1000, // 2 horas de inactividad
    },
  })
);

// ---- Variables para las vistas
app.use((req, res, next) => {
  Object.assign(res.locals, formato);
  res.locals.rutaActual = req.path;
  res.locals.aviso = req.session.aviso || null;
  delete req.session.aviso;
  next();
});
app.use(usuarioEnVistas);
app.use(proteccionCsrf);

app.use(api);
app.use(rutas);

app.use(noEncontrado);
app.use(manejadorErrores);

module.exports = app;
