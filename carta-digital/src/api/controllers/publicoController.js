// Endpoints públicos de lectura: restaurantes, carta, platos y comentarios.
const Restaurante = require('../../models/restauranteModel');
const Carta = require('../../models/cartaModel');
const Comentario = require('../../models/comentarioModel');
const Auditoria = require('../../models/auditoriaModel');
const { imagenRestaurante } = require('../../utils/formato');
const { ok, noEncontrado, paginacion } = require('../../utils/http');

// Quita la columna auxiliar total_filas y arma la paginación.
function paginado(filas, { pagina, porPagina }) {
  const total = filas.length ? filas[0].total_filas : 0;
  const datos = filas.map(({ total_filas, ...resto }) => resto);
  return { datos, paginacion: { pagina, porPagina, total, paginas: Math.ceil(total / porPagina) } };
}

function conImagen(restauranteId, item) {
  return { ...item, imagen: imagenRestaurante(restauranteId, item.foto) };
}

async function restauranteOError(id) {
  const r = await Restaurante.buscarPorId(id);
  if (!r) throw noEncontrado('Restaurante');
  return r;
}

async function listarRestaurantes(req, res) {
  const q = req.valid.query;
  const filas = await Restaurante.buscar({ ...q, ...paginacion(q) });
  const { datos, paginacion: pag } = paginado(filas, q);
  ok(res, datos.map((r) => conImagen(r.id, r)), { paginacion: pag });
}

async function verRestaurante(req, res) {
  const r = await restauranteOError(req.valid.params.id);
  const resumen = await Restaurante.resumen(r.id);
  const { calle, numero, comuna, region, ...datos } = r;
  ok(res, {
    ...conImagen(r.id, datos),
    direccion: { calle, numero, comuna, region },
    resumen,
    enlaces: {
      web: `/restaurantes/${r.id}`,
      carta: `/api/v1/restaurantes/${r.id}/carta`,
      platos: `/api/v1/restaurantes/${r.id}/platos`,
      comentarios: `/api/v1/restaurantes/${r.id}/comentarios`,
    },
  });
}

async function verCarta(req, res) {
  const r = await restauranteOError(req.valid.params.id);
  const cartas = await Carta.cartaCompleta(r.id);
  ok(
    res,
    cartas.map((c) => ({
      ...c,
      categorias: c.categorias.map((cat) => ({
        id: cat.id,
        nombre: cat.nombre,
        items: cat.items.map(({ categorias_id, ...i }) => conImagen(r.id, i)),
      })),
    }))
  );
}

async function destacados(req, res) {
  const r = await restauranteOError(req.valid.params.id);
  ok(res, (await Carta.destacados(r.id)).map((i) => conImagen(r.id, i)));
}

async function platosRestaurante(req, res) {
  const r = await restauranteOError(req.valid.params.id);
  const q = req.valid.query;
  const filas = await Carta.buscarPlatos({ ...q, restauranteId: r.id, ...paginacion(q) });
  const { datos, paginacion: pag } = paginado(filas, q);
  ok(res, datos.map((i) => conImagen(r.id, i)), { paginacion: pag });
}

async function buscarPlatos(req, res) {
  const q = req.valid.query;
  const filas = await Carta.buscarPlatos({ ...q, ...paginacion(q) });
  const { datos, paginacion: pag } = paginado(filas, q);
  ok(res, datos.map((i) => conImagen(i.restaurante_id, i)), { paginacion: pag });
}

async function comentarios(req, res) {
  const r = await restauranteOError(req.valid.params.id);
  const q = req.valid.query;
  const filas = await Comentario.listarPorRestaurante(r.id, paginacion(q));
  const { datos, paginacion: pag } = paginado(filas, q);
  ok(res, datos, { paginacion: pag });
}

// El autor sale de la sesión, nunca del cuerpo de la petición.
async function comentar(req, res) {
  const r = await restauranteOError(req.valid.params.id);
  const nuevo = await Comentario.crear({
    comentario: req.valid.body.comentario,
    usuarioId: req.session.usuario.id,
    restauranteId: r.id,
  });
  await Auditoria.desde(req, 'comentario_crear', { entidad: 'comentarios', entidadId: nuevo.id, detalle: { restauranteId: r.id } });
  ok(res, { ...nuevo, usuario: req.session.usuario.nombre }, {}, 201);
}

module.exports = { paginado, listarRestaurantes, verRestaurante, verCarta, destacados, platosRestaurante, buscarPlatos, comentarios, comentar };
