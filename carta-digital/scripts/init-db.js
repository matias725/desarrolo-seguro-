// Crea las tablas y carga los datos de ejemplo en la base indicada en .env.
// Uso (solo en desarrollo local, sin Docker):  npm run db:init
// Con Docker no hace falta: el contenedor de postgres ejecuta db/init/*.sql solo.
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/config/db');

(async () => {
  const carpeta = path.join(__dirname, '..', 'db', 'init');
  const archivos = fs.readdirSync(carpeta).filter((f) => f.endsWith('.sql')).sort();
  try {
    const { rows } = await pool.query("SELECT to_regclass('public.restaurantes') AS existe");
    if (rows[0].existe) {
      console.log('La base ya tiene tablas; no se modifica nada.');
      return;
    }
    for (const archivo of archivos) {
      console.log(`Ejecutando ${archivo}...`);
      await pool.query(fs.readFileSync(path.join(carpeta, archivo), 'utf8'));
    }
    console.log('Base de datos lista. Crea un usuario con: npm run crear-usuario');
  } catch (err) {
    console.error('Error inicializando la base:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
