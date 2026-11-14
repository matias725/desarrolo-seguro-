// Carga y valida la configuración desde variables de entorno (.env).
// Ninguna credencial queda escrita en el código.
require('dotenv').config({ quiet: true });

const NODE_ENV = process.env.NODE_ENV || 'development';
const esProduccion = NODE_ENV === 'production';

function requerida(nombre, valorPorDefecto) {
  const valor = process.env[nombre] ?? valorPorDefecto;
  if (valor === undefined || valor === '') {
    throw new Error(`Falta la variable de entorno ${nombre} (revisa tu archivo .env)`);
  }
  return valor;
}

const config = {
  nodeEnv: NODE_ENV,
  esProduccion,
  port: Number(process.env.PORT || 3000),
  // Detrás de Nginx / Cloudflare / balanceador de AWS hay que confiar en el proxy
  // para que req.secure y la IP del cliente (rate limit) sean correctos.
  trustProxy: process.env.TRUST_PROXY || (esProduccion ? '1' : 'false'),
  db: {
    host: requerida('DB_HOST', 'localhost'),
    port: Number(process.env.DB_PORT || 5432),
    database: requerida('DB_NAME', 'carta_digital'),
    user: requerida('DB_USER'),
    password: requerida('DB_PASSWORD'),
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' } : false,
  },
  sessionSecret: requerida('SESSION_SECRET'),
  // Documentación interactiva de la API (Swagger) en /api/docs.
  // Por defecto desactivada en producción para no exponer el mapa de la API.
  apiDocs: process.env.API_DOCS ? process.env.API_DOCS === 'true' : !esProduccion,
};

if (esProduccion && config.sessionSecret.length < 32) {
  throw new Error('SESSION_SECRET debe tener al menos 32 caracteres en producción');
}

module.exports = config;
