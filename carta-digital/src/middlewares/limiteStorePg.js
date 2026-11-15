// Almacén de express-rate-limit en PostgreSQL: el contador de peticiones es
// compartido por todas las instancias del Auto Scaling Group.
const { query } = require('../config/db');
const logger = require('../config/logger');

class LimiteStorePg {
  constructor(prefijo) {
    this.prefix = prefijo;
    this.localKeys = false;
  }

  init(opciones) {
    this.windowMs = opciones.windowMs;
  }

  clave(key) {
    return `${this.prefix}:${key}`.slice(0, 200);
  }

  // Suma 1 de forma atómica; si la ventana ya venció, el contador parte de nuevo.
  async increment(key) {
    const { rows } = await query(
      `INSERT INTO limites_peticiones (clave, hits, reinicio)
       VALUES ($1, 1, NOW() + make_interval(secs => $2::double precision / 1000))
       ON CONFLICT (clave) DO UPDATE SET
         hits = CASE WHEN limites_peticiones.reinicio <= NOW() THEN 1 ELSE limites_peticiones.hits + 1 END,
         reinicio = CASE WHEN limites_peticiones.reinicio <= NOW()
                         THEN NOW() + make_interval(secs => $2::double precision / 1000)
                         ELSE limites_peticiones.reinicio END
       RETURNING hits, reinicio`,
      [this.clave(key), this.windowMs]
    );
    return { totalHits: rows[0].hits, resetTime: new Date(rows[0].reinicio) };
  }

  async get(key) {
    const { rows } = await query('SELECT hits, reinicio FROM limites_peticiones WHERE clave = $1 AND reinicio > NOW()', [this.clave(key)]);
    return rows[0] ? { totalHits: rows[0].hits, resetTime: new Date(rows[0].reinicio) } : undefined;
  }

  async decrement(key) {
    await query('UPDATE limites_peticiones SET hits = GREATEST(hits - 1, 0) WHERE clave = $1', [this.clave(key)]);
  }

  async resetKey(key) {
    await query('DELETE FROM limites_peticiones WHERE clave = $1', [this.clave(key)]);
  }
}

// Limpieza periódica de contadores vencidos (no bloquea el cierre del proceso).
let limpieza;
function iniciarLimpieza() {
  if (limpieza) return;
  limpieza = setInterval(() => {
    query("DELETE FROM limites_peticiones WHERE reinicio < NOW() - INTERVAL '1 hour'").catch((err) =>
      logger.warn({ err: err.message }, 'no se pudieron limpiar los límites vencidos')
    );
  }, 10 * 60 * 1000);
  limpieza.unref();
}

module.exports = { LimiteStorePg, iniciarLimpieza };
