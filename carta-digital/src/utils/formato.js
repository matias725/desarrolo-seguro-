// Helpers de presentación disponibles en las vistas (res.locals).

const formatoCLP = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
});

function moneda(valor) {
  return formatoCLP.format(Number(valor) || 0);
}

// Solo nombres de archivo simples (sin rutas ni "..") para armar URLs de imágenes.
function nombreArchivoSeguro(nombre) {
  return typeof nombre === 'string' && /^[\w-]+\.(jpe?g|png|webp|gif)$/i.test(nombre) ? nombre : null;
}

function imagenRestaurante(restauranteId, foto, comodin = '/img/logo_empresa_comodin.png') {
  const archivo = nombreArchivoSeguro(foto);
  return archivo ? `/imagenes/cod${Number(restauranteId)}/${archivo}` : comodin;
}

const formatoFecha = new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' });
function fecha(valor) {
  return valor ? formatoFecha.format(new Date(valor)) : '';
}

module.exports = { moneda, imagenRestaurante, fecha, nombreArchivoSeguro };
