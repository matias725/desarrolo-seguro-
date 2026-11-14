// Límites de peticiones por IP (mitigan fuerza bruta, spam y abuso).
// Se comparten entre la web y la API: un atacante no puede saltarse el
// límite del formulario de login usando /api/v1/auth/login.
const rateLimit = require('express-rate-limit');

const comun = { standardHeaders: 'draft-8', legacyHeaders: false };

// Los límites se pueden ajustar por variable de entorno (ej. en QA).
const n = (variable, porDefecto) => Number(process.env[variable]) || porDefecto;

// Login: 5 intentos fallidos cada 15 min.
const limiteLogin = rateLimit({
  ...comun,
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  // Un login fallido en la web responde 302, así que el éxito se mide por si
  // quedó un usuario en la sesión, no por el código HTTP.
  requestWasSuccessful: (req) => Boolean(req.session && req.session.usuario),
});

// Comentarios: 10 por hora.
const limiteComentarios = rateLimit({ ...comun, windowMs: 60 * 60 * 1000, limit: 10 });

// Registro de cuentas: 5 por hora.
const limiteRegistro = rateLimit({ ...comun, windowMs: 60 * 60 * 1000, limit: n('LIMITE_REGISTRO_HORA', 5) });

// Pedidos: 20 por hora (evita llenar la cocina de pedidos falsos).
const limitePedidos = rateLimit({ ...comun, windowMs: 60 * 60 * 1000, limit: n('LIMITE_PEDIDOS_HORA', 20) });

// API en general: 300 peticiones cada 5 minutos.
const limiteApi = rateLimit({ ...comun, windowMs: 5 * 60 * 1000, limit: n('LIMITE_API_5MIN', 300) });

module.exports = { limiteLogin, limiteComentarios, limiteRegistro, limitePedidos, limiteApi };
