// Valida params, query y body con Zod antes de llegar al controlador.
// El resultado limpio queda en req.valid (los controladores nunca leen
// req.body / req.query directamente).
const { httpError } = require('../utils/http');

function detallesZod(error) {
  return error.issues.map((i) => ({ campo: i.path.join('.') || null, mensaje: i.message }));
}

function validar({ params, query, body } = {}) {
  return (req, res, next) => {
    req.valid = { params: {}, query: {}, body: {} };

    if (params) {
      const r = params.safeParse(req.params);
      // Un id malformado en la URL es "no existe", igual que en la web.
      if (!r.success) return next(httpError(404, 'Recurso no encontrado'));
      req.valid.params = r.data;
    }
    if (query) {
      const r = query.safeParse(req.query);
      if (!r.success) return next(httpError(400, 'Parámetros de búsqueda inválidos', detallesZod(r.error)));
      req.valid.query = r.data;
    }
    if (body) {
      if (!req.is('application/json')) return next(httpError(415, 'Envía el cuerpo como JSON (Content-Type: application/json)'));
      const r = body.safeParse(req.body ?? {});
      if (!r.success) return next(httpError(400, 'Datos inválidos', detallesZod(r.error)));
      req.valid.body = r.data;
    }
    next();
  };
}

module.exports = { validar };
