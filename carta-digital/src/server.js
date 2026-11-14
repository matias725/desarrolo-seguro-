const app = require('./app');
const config = require('./config/env');
const { pool } = require('./config/db');
const logger = require('./config/logger');

const server = app.listen(config.port, () => {
  logger.info(`Carta Digital [${config.nodeEnv}] escuchando en http://localhost:${config.port} — API en /api/v1${config.apiDocs ? ', docs en /api/docs' : ''}`);
});

// Apagado ordenado (Docker envía SIGTERM al detener el contenedor)
function apagar(senal) {
  logger.info(`${senal} recibido, cerrando...`);
  server.close(() => pool.end().then(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => apagar('SIGTERM'));
process.on('SIGINT', () => apagar('SIGINT'));
