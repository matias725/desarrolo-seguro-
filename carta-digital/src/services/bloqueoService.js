// Bloqueo de cuenta por intentos fallidos: 5 fallos en 15 minutos bloquean
// ese correo durante 15 minutos, aunque el atacante cambie de IP
// (complementa el límite por IP de middlewares/limites.js).
const { query } = require('../config/db');

const MAX_FALLOS = Number(process.env.BLOQUEO_MAX_FALLOS) || 5;
const MINUTOS = Number(process.env.BLOQUEO_MINUTOS) || 15;

async function estado(email) {
  const { rows } = await query(
    'SELECT fallos, bloqueado_hasta FROM intentos_login WHERE email = $1 AND bloqueado_hasta > NOW()',
    [email]
  );
  return rows[0] ? { bloqueado: true, hasta: rows[0].bloqueado_hasta } : { bloqueado: false };
}

// Suma un fallo de forma atómica (sin condiciones de carrera entre peticiones
// simultáneas). Si la ventana de 15 min ya pasó, el contador parte de nuevo.
async function registrarFallo(email, ip) {
  const { rows } = await query(
    `INSERT INTO intentos_login (email, fallos, primer_fallo, ultima_ip)
     VALUES ($1, 1, NOW(), $2)
     ON CONFLICT (email) DO UPDATE SET
       fallos = CASE WHEN intentos_login.primer_fallo < NOW() - make_interval(mins => $3)
                     THEN 1 ELSE intentos_login.fallos + 1 END,
       primer_fallo = CASE WHEN intentos_login.primer_fallo < NOW() - make_interval(mins => $3)
                           THEN NOW() ELSE intentos_login.primer_fallo END,
       ultima_ip = $2
     RETURNING fallos`,
    [email, ip, MINUTOS]
  );
  const { fallos } = rows[0];
  if (fallos >= MAX_FALLOS) {
    const { rows: b } = await query(
      `UPDATE intentos_login SET bloqueado_hasta = NOW() + make_interval(mins => $2), fallos = 0, primer_fallo = NOW()
        WHERE email = $1 RETURNING bloqueado_hasta`,
      [email, MINUTOS]
    );
    return { fallos, recienBloqueado: true, hasta: b[0].bloqueado_hasta };
  }
  return { fallos, recienBloqueado: false, restantes: MAX_FALLOS - fallos };
}

async function limpiar(email) {
  await query('DELETE FROM intentos_login WHERE email = $1', [email]);
}

async function bloqueadosPorEmail(emails) {
  if (!emails.length) return new Map();
  const { rows } = await query(
    'SELECT email, bloqueado_hasta FROM intentos_login WHERE email = ANY($1::text[]) AND bloqueado_hasta > NOW()',
    [emails]
  );
  return new Map(rows.map((r) => [r.email, r.bloqueado_hasta]));
}

module.exports = { MAX_FALLOS, MINUTOS, estado, registrarFallo, limpiar, bloqueadosPorEmail };
