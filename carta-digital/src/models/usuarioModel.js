const { query } = require('../config/db');

const COLUMNAS_PUBLICAS = 'id, nombre, email, rol, activo, creado, ultimo_login, totp_activo';

async function buscarPorEmail(email) {
  const { rows } = await query(
    `SELECT id, nombre, email, password_hash, activo, rol, totp_activo
       FROM usuarios
      WHERE email = $1`,
    [email]
  );
  return rows[0] || null;
}

async function buscarPorId(id) {
  const { rows } = await query(`SELECT ${COLUMNAS_PUBLICAS} FROM usuarios WHERE id = $1`, [id]);
  return rows[0] || null;
}

async function hashDe(id) {
  const { rows } = await query('SELECT password_hash FROM usuarios WHERE id = $1', [id]);
  return rows[0] ? rows[0].password_hash : null;
}

// El rol nunca viene del formulario de registro: siempre es 'cliente'
// salvo que lo indique el script de administración.
async function crear({ nombre, email, passwordHash, rol = 'cliente' }) {
  const { rows } = await query(
    `INSERT INTO usuarios (nombre, email, password_hash, rol)
     VALUES ($1, $2, $3, $4)
     RETURNING ${COLUMNAS_PUBLICAS}`,
    [nombre, email, passwordHash, rol]
  );
  return rows[0];
}

async function registrarLogin(id) {
  await query('UPDATE usuarios SET ultimo_login = NOW() WHERE id = $1', [id]);
}

async function cambiarPassword(id, passwordHash, q = query) {
  await q('UPDATE usuarios SET password_hash = $2, password_cambiada = NOW() WHERE id = $1', [id, passwordHash]);
}

// ---- Doble factor (TOTP)
async function datos2fa(id) {
  const { rows } = await query(
    `SELECT id, nombre, email, rol, activo, totp_secreto, totp_pendiente, totp_activo, totp_ultimo_paso,
            jsonb_array_length(totp_respaldo)::int AS respaldos_restantes
       FROM usuarios WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function guardarTotpPendiente(id, secretoCifrado) {
  await query('UPDATE usuarios SET totp_pendiente = $2 WHERE id = $1', [id, secretoCifrado]);
}

async function activarTotp(id, secretoCifrado, paso, hashesRespaldo) {
  await query(
    `UPDATE usuarios SET totp_secreto = $2, totp_pendiente = NULL, totp_activo = TRUE,
            totp_ultimo_paso = $3, totp_respaldo = $4::jsonb
      WHERE id = $1`,
    [id, secretoCifrado, paso, JSON.stringify(hashesRespaldo)]
  );
}

async function regenerarRespaldo(id, hashesRespaldo) {
  await query('UPDATE usuarios SET totp_respaldo = $2::jsonb WHERE id = $1', [id, JSON.stringify(hashesRespaldo)]);
}

async function desactivarTotp(id) {
  await query(
    `UPDATE usuarios SET totp_secreto = NULL, totp_pendiente = NULL, totp_activo = FALSE,
            totp_ultimo_paso = NULL, totp_respaldo = '[]'::jsonb
      WHERE id = $1`,
    [id]
  );
}

// Acepta el código solo si su intervalo es posterior al último usado
// (atómico: dos peticiones simultáneas con el mismo código no pasan las dos).
async function marcarPasoTotp(id, paso) {
  const { rowCount } = await query(
    `UPDATE usuarios SET totp_ultimo_paso = $2
      WHERE id = $1 AND (totp_ultimo_paso IS NULL OR totp_ultimo_paso < $2)`,
    [id, paso]
  );
  return rowCount > 0;
}

// Consume un código de respaldo (se borra: no sirve dos veces).
async function consumirRespaldo(id, hash) {
  const { rowCount } = await query(
    `UPDATE usuarios SET totp_respaldo = totp_respaldo - $2::text
      WHERE id = $1 AND totp_respaldo ? $2::text`,
    [id, hash]
  );
  return rowCount > 0;
}

async function correosAdmins() {
  const { rows } = await query("SELECT email FROM usuarios WHERE rol = 'admin' AND activo");
  return rows.map((r) => r.email);
}

async function listar({ q, rol, limite, desplazamiento }) {
  const { rows } = await query(
    `SELECT ${COLUMNAS_PUBLICAS}, COUNT(*) OVER()::int AS total_filas
       FROM usuarios
      WHERE ($1::text IS NULL OR nombre ILIKE '%' || $1 || '%' OR email ILIKE '%' || $1 || '%')
        AND ($2::text IS NULL OR rol = $2)
      ORDER BY id
      LIMIT $3 OFFSET $4`,
    [q ?? null, rol ?? null, limite, desplazamiento]
  );
  return rows;
}

async function actualizar(id, { rol, activo }) {
  const { rows } = await query(
    `UPDATE usuarios
        SET rol = COALESCE($2, rol),
            activo = COALESCE($3, activo)
      WHERE id = $1
      RETURNING ${COLUMNAS_PUBLICAS}`,
    [id, rol ?? null, activo ?? null]
  );
  return rows[0] || null;
}

module.exports = {
  buscarPorEmail,
  buscarPorId,
  hashDe,
  crear,
  registrarLogin,
  cambiarPassword,
  listar,
  actualizar,
  datos2fa,
  guardarTotpPendiente,
  activarTotp,
  regenerarRespaldo,
  desactivarTotp,
  marcarPasoTotp,
  consumirRespaldo,
  correosAdmins,
};
