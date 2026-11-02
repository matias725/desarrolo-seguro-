const { query } = require('../config/db');

async function buscarPorId(id) {
  const { rows } = await query(
    `SELECT r.id, r.nombre, r.fono, r.email, r.foto,
            d.calle, d.numero, d.comuna, d.region
       FROM restaurantes r
       JOIN direcciones d ON d.id = r.direcciones_id
      WHERE r.id = $1 AND r.eliminado IS NULL`,
    [id]
  );
  return rows[0] || null;
}

async function listar() {
  const { rows } = await query(
    `SELECT r.id, r.nombre, r.foto, d.comuna
       FROM restaurantes r
       JOIN direcciones d ON d.id = r.direcciones_id
      WHERE r.eliminado IS NULL
      ORDER BY r.nombre`
  );
  return rows;
}

module.exports = { buscarPorId, listar };
