// Validaciones de entrada reutilizables.

const MAX_INT = 2147483647; // límite de INTEGER en PostgreSQL

// Convierte un id recibido (URL o body) en entero positivo; null si no es válido.
// Ej: "1 OR 1=1", "-1", "1.5", "abc", "99999999999" -> null
function parseId(valor) {
  if (typeof valor === 'number') valor = String(valor);
  if (typeof valor !== 'string' || !/^[1-9]\d{0,9}$/.test(valor)) return null;
  const n = Number(valor);
  return n <= MAX_INT ? n : null;
}

// Texto libre: recorta espacios, exige tipo string y largo dentro de rango.
function textoValido(valor, { min = 1, max = 1000 } = {}) {
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim();
  if (limpio.length < min || limpio.length > max) return null;
  return limpio;
}

function emailValido(valor) {
  const email = textoValido(valor, { min: 3, max: 255 });
  if (!email) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.toLowerCase() : null;
}

// Evita redirecciones abiertas: solo rutas internas como "/restaurantes/1".
function rutaInternaSegura(valor, porDefecto = '/') {
  if (typeof valor !== 'string') return porDefecto;
  if (!/^\/(?!\/)[\w\-\/]*$/.test(valor)) return porDefecto; // bloquea "//evil.com", "http://", "\\"
  return valor;
}

module.exports = { parseId, textoValido, emailValido, rutaInternaSegura };
