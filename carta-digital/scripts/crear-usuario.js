// Crea un usuario con la contraseña hasheada con bcrypt.
// Uso interactivo:      npm run crear-usuario
// Uso no interactivo:   NUEVO_NOMBRE=.. NUEVO_EMAIL=.. NUEVO_PASSWORD=.. npm run crear-usuario
// Administrador:        npm run crear-admin   (o NUEVO_ROL=admin)
// La contraseña nunca se guarda en texto plano ni se escribe en el repositorio.
const readline = require('readline');
const bcrypt = require('bcryptjs');
const { pool } = require('../src/config/db');
const Usuario = require('../src/models/usuarioModel');
const { emailValido, textoValido } = require('../src/utils/validacion');

function preguntar(rl, texto) {
  return new Promise((resolve) => rl.question(texto, resolve));
}

(async () => {
  let { NUEVO_NOMBRE: nombre, NUEVO_EMAIL: email, NUEVO_PASSWORD: password } = process.env;
  const rol = process.argv.includes('--admin') || process.env.NUEVO_ROL === 'admin' ? 'admin' : 'cliente';
  if (!nombre || !email || !password) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    nombre = nombre || (await preguntar(rl, 'Nombre: '));
    email = email || (await preguntar(rl, 'Correo: '));
    password = password || (await preguntar(rl, 'Contraseña (mín. 10 caracteres): '));
    rl.close();
  }

  try {
    nombre = textoValido(nombre, { min: 2, max: 100 });
    email = emailValido(email);
    if (!nombre || !email) throw new Error('Nombre o correo inválido');
    if (typeof password !== 'string' || password.length < 10 || password.length > 128) {
      throw new Error('La contraseña debe tener entre 10 y 128 caracteres');
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const usuario = await Usuario.crear({ nombre, email, passwordHash, rol });
    console.log(`Usuario creado: ${usuario.nombre} <${usuario.email}> (id ${usuario.id}, rol ${usuario.rol})`);
  } catch (err) {
    console.error('No se pudo crear el usuario:', err.code === '23505' ? 'ese correo ya existe' : err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
