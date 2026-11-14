// Aplica las migraciones del backend v2 sobre una base EXISTENTE
// (por ejemplo la de RDS que ya tenía la versión 1).
// Uso:  npm run db:migrate
// Usa las credenciales del .env: deben tener permiso para ALTER/CREATE
// (usuario administrador de la BD, no el rol limitado carta_app).
// Después, dar permisos al rol de la app:
//   APP_DB_USER=carta_app POSTGRES_USER=... POSTGRES_DB=... sh db/init/05_permisos_v2.sh
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/config/db');

const MIGRACIONES = ['04_backend_v2.sql'];

(async () => {
  try {
    for (const archivo of MIGRACIONES) {
      console.log(`Aplicando ${archivo}...`);
      await pool.query(fs.readFileSync(path.join(__dirname, '..', 'db', 'init', archivo), 'utf8'));
    }
    console.log('Migración completa.');
  } catch (err) {
    console.error('Error en la migración:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
