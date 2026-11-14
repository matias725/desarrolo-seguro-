// Helpers para respuestas y errores HTTP.

// Crea un error con código HTTP. Con expose=true el mensaje es seguro de
// mostrar al cliente (lo escribimos nosotros, no viene de la BD ni de Node).
function httpError(status, mensaje, detalles) {
  const err = new Error(mensaje);
  err.status = status;
  err.expose = true;
  if (detalles) err.detalles = detalles;
  return err;
}

const noEncontrado = (que = 'Recurso') => httpError(404, `${que} no encontrado`);

// Respuesta estándar de la API: { ok: true, datos, paginacion? }
function ok(res, datos, extra = {}, status = 200) {
  return res.status(status).json({ ok: true, datos, ...extra });
}

function paginacion({ pagina = 1, porPagina = 20 } = {}) {
  return { pagina, porPagina, limite: porPagina, desplazamiento: (pagina - 1) * porPagina };
}

module.exports = { httpError, noEncontrado, ok, paginacion };
