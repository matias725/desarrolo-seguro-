// Panel de administración por API (requiere rol admin).
// Toda acción que modifica datos queda registrada en la auditoría.
const Catalogo = require('../../models/catalogoAdminModel');
const Comentario = require('../../models/comentarioModel');
const Usuario = require('../../models/usuarioModel');
const Pedido = require('../../models/pedidoModel');
const Auditoria = require('../../models/auditoriaModel');
const { paginado } = require('./publicoController');
const { ok, httpError, noEncontrado, paginacion } = require('../../utils/http');

const NOMBRES = { restaurantes: 'Restaurante', cartas: 'Carta', categorias: 'Categoría', items: 'Producto' };
const PADRES = { cartas: 'restaurantes', categorias: 'cartas', items: 'categorias' };

const auditar = (req, accion, entidad, entidadId, detalle) => Auditoria.desde(req, accion, { entidad, entidadId, detalle });

// ---------------- Estadísticas
async function estadisticas(req, res) {
  ok(res, await Pedido.estadisticas(req.valid.query));
}

// ---------------- Restaurantes
async function listarRestaurantes(req, res) {
  const q = req.valid.query;
  const { datos, paginacion: pag } = paginado(await Catalogo.listarRestaurantes({ ...q, ...paginacion(q) }), q);
  ok(res, datos, { paginacion: pag });
}

async function verRestaurante(req, res) {
  const r = await Catalogo.obtenerRestaurante(req.valid.params.id);
  if (!r) throw noEncontrado('Restaurante');
  ok(res, { ...r, cartas: await Catalogo.cartaAdmin(r.id) });
}

async function crearRestaurante(req, res) {
  const r = await Catalogo.crearRestaurante(req.valid.body);
  await auditar(req, 'admin_crear', 'restaurantes', r.id, { nombre: r.nombre });
  res.location(`/api/v1/admin/restaurantes/${r.id}`);
  ok(res, r, {}, 201);
}

async function editarRestaurante(req, res) {
  const r = await Catalogo.actualizarRestaurante(req.valid.params.id, req.valid.body);
  if (!r) throw noEncontrado('Restaurante');
  await auditar(req, 'admin_editar', 'restaurantes', r.id, { campos: Object.keys(req.valid.body) });
  ok(res, r);
}

async function restaurarRestaurante(req, res) {
  const { id } = req.valid.params;
  if (!(await Catalogo.restaurarRestaurante(id))) throw noEncontrado('Restaurante eliminado');
  await auditar(req, 'admin_restaurar', 'restaurantes', id);
  ok(res, await Catalogo.obtenerRestaurante(id));
}

// ---------------- Cartas, categorías e ítems (CRUD genérico)
function crearEn(tabla) {
  return async (req, res) => {
    const padreId = req.valid.params.id;
    const nuevo = await Catalogo.crearHijo(tabla, padreId, req.valid.body);
    if (!nuevo) throw noEncontrado(NOMBRES[PADRES[tabla]]);
    await auditar(req, 'admin_crear', tabla, nuevo.id, { nombre: nuevo.nombre, padreId });
    ok(res, nuevo, {}, 201);
  };
}

function editar(tabla) {
  return async (req, res) => {
    const { id } = req.valid.params;
    const actualizado = await Catalogo.actualizar(tabla, id, req.valid.body);
    if (!actualizado) throw noEncontrado(NOMBRES[tabla]);
    await auditar(req, 'admin_editar', tabla, id, { campos: Object.keys(req.valid.body) });
    ok(res, actualizado);
  };
}

function eliminar(tabla) {
  return async (req, res) => {
    const { id } = req.valid.params;
    if (!(await Catalogo.eliminar(tabla, id))) throw noEncontrado(NOMBRES[tabla]);
    await auditar(req, 'admin_eliminar', tabla, id);
    ok(res, { id, eliminado: true });
  };
}

// ---------------- Comentarios
async function listarComentarios(req, res) {
  const q = req.valid.query;
  const filas = await Comentario.listarAdmin({ restauranteId: q.restaurante, oculto: q.oculto, ...paginacion(q) });
  const { datos, paginacion: pag } = paginado(filas, q);
  ok(res, datos, { paginacion: pag });
}

async function moderarComentario(req, res) {
  const { id } = req.valid.params;
  const c = await Comentario.cambiarVisibilidad(id, req.valid.body.oculto);
  if (!c) throw noEncontrado('Comentario');
  await auditar(req, c.oculto ? 'comentario_ocultar' : 'comentario_mostrar', 'comentarios', id);
  ok(res, c);
}

async function eliminarComentario(req, res) {
  const { id } = req.valid.params;
  if (!(await Comentario.eliminar(id))) throw noEncontrado('Comentario');
  await auditar(req, 'comentario_eliminar', 'comentarios', id);
  ok(res, { id, eliminado: true });
}

// ---------------- Usuarios
async function listarUsuarios(req, res) {
  const q = req.valid.query;
  const { datos, paginacion: pag } = paginado(await Usuario.listar({ ...q, ...paginacion(q) }), q);
  ok(res, datos, { paginacion: pag });
}

async function editarUsuario(req, res) {
  const { id } = req.valid.params;
  const cambios = req.valid.body;
  // Un admin no puede quitarse el rol ni desactivarse a sí mismo
  // (evita quedarse sin ningún administrador por error).
  if (id === req.session.usuario.id && (cambios.rol === 'cliente' || cambios.activo === false)) {
    throw httpError(409, 'No puedes quitarte el rol de admin ni desactivar tu propia cuenta');
  }
  const u = await Usuario.actualizar(id, cambios);
  if (!u) throw noEncontrado('Usuario');
  await auditar(req, 'usuario_editar', 'usuarios', id, cambios);
  ok(res, u);
}

// ---------------- Pedidos
async function listarPedidos(req, res) {
  const q = req.valid.query;
  const filas = await Pedido.listar({ restauranteId: q.restaurante, estado: q.estado, desde: q.desde, hasta: q.hasta, ...paginacion(q) });
  const { datos, paginacion: pag } = paginado(filas, q);
  ok(res, datos, { paginacion: pag });
}

async function verPedido(req, res) {
  const p = await Pedido.buscarPorId(req.valid.params.id);
  if (!p) throw noEncontrado('Pedido');
  ok(res, { ...p, siguientesEstados: Pedido.TRANSICIONES[p.estado] });
}

async function cambiarEstadoPedido(req, res) {
  const { id } = req.valid.params;
  const { estado } = req.valid.body;
  const p = await Pedido.buscarPorId(id);
  if (!p) throw noEncontrado('Pedido');
  if (!Pedido.TRANSICIONES[p.estado].includes(estado)) {
    const permitidos = Pedido.TRANSICIONES[p.estado];
    throw httpError(409, `No se puede pasar de "${p.estado}" a "${estado}"`, [
      { campo: 'estado', mensaje: permitidos.length ? `Estados permitidos: ${permitidos.join(', ')}` : 'El pedido ya está cerrado' },
    ]);
  }
  if (!(await Pedido.cambiarEstado(id, p.estado, estado))) throw httpError(409, 'El pedido cambió de estado, vuelve a consultarlo');
  await auditar(req, 'pedido_estado', 'pedidos', id, { de: p.estado, a: estado, codigo: p.codigo });
  const actualizado = await Pedido.buscarPorId(id);
  ok(res, { ...actualizado, siguientesEstados: Pedido.TRANSICIONES[actualizado.estado] });
}

// ---------------- Auditoría
async function auditoria(req, res) {
  const q = req.valid.query;
  const filas = await Auditoria.listar({ accion: q.accion, usuarioId: q.usuario, entidad: q.entidad, ...paginacion(q) });
  const { datos, paginacion: pag } = paginado(filas, q);
  ok(res, datos, { paginacion: pag });
}

module.exports = {
  estadisticas,
  listarRestaurantes,
  verRestaurante,
  crearRestaurante,
  editarRestaurante,
  restaurarRestaurante,
  eliminarRestaurante: eliminar('restaurantes'),
  crearCarta: crearEn('cartas'),
  editarCarta: editar('cartas'),
  eliminarCarta: eliminar('cartas'),
  crearCategoria: crearEn('categorias'),
  editarCategoria: editar('categorias'),
  eliminarCategoria: eliminar('categorias'),
  crearItem: crearEn('items'),
  editarItem: editar('items'),
  eliminarItem: eliminar('items'),
  listarComentarios,
  moderarComentario,
  eliminarComentario,
  listarUsuarios,
  editarUsuario,
  listarPedidos,
  verPedido,
  cambiarEstadoPedido,
  auditoria,
};
