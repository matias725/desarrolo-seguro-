// Páginas web nuevas: cuenta, pedidos y panel de administración.
// Las acciones (formularios) se hacen contra la API /api/v1 desde
// public/js/*.js, así la web y la API comparten validación, permisos y
// auditoría. Aquí solo se arma la página y se controla quién puede verla.
const Usuario = require('../models/usuarioModel');
const Pedido = require('../models/pedidoModel');

const CODIGO_PEDIDO = /^[A-Z2-9]{8}$/;

function noEncontrada() {
  const err = new Error('Página no encontrada');
  err.status = 404;
  return err;
}

// GET /registro
function registro(req, res) {
  if (req.session.usuario) return res.redirect('/cuenta');
  res.render('registro', { titulo: 'Crear una cuenta', scripts: ['comun', 'cuenta'] });
}

// GET /recuperar
function recuperar(req, res) {
  res.render('recuperar', { titulo: 'Recuperar contraseña', scripts: ['comun', 'cuenta'] });
}

// GET /cuenta (requiere sesión)
async function cuenta(req, res, next) {
  const usuario = await Usuario.buscarPorId(req.session.usuario.id);
  if (!usuario || !usuario.activo) return next(noEncontrada());
  res.render('cuenta', { titulo: 'Mi cuenta', cuenta: usuario, scripts: ['comun', 'cuenta'] });
}

// GET /mis-pedidos (requiere sesión)
async function misPedidos(req, res) {
  const pedidos = await Pedido.listar({ usuarioId: req.session.usuario.id, limite: 50, desplazamiento: 0 });
  res.render('mis-pedidos', { titulo: 'Mis pedidos', pedidos, scripts: ['comun', 'pedidos'] });
}

// GET /seguimiento?codigo=XXXX — formulario "seguir un pedido"
function seguimiento(req, res) {
  const codigo = String(req.query.codigo || '').trim().toUpperCase();
  if (CODIGO_PEDIDO.test(codigo)) return res.redirect(`/pedidos/${codigo}`);
  req.session.aviso = { tipo: 'error', texto: 'El código de pedido tiene 8 letras y números (ej: K7P2QX9M).' };
  res.redirect(req.session.usuario ? '/mis-pedidos' : '/');
}

// GET /pedidos/:codigo — seguimiento público (el código es el "secreto")
async function pedido(req, res, next) {
  const codigo = String(req.params.codigo || '').toUpperCase();
  if (!CODIGO_PEDIDO.test(codigo)) return next(noEncontrada());
  const p = await Pedido.buscarPorCodigo(codigo);
  if (!p) return next(noEncontrada());

  const esDueno =
    (req.session.usuario && p.usuario_id === req.session.usuario.id) || (req.session.pedidos || []).includes(p.codigo);
  res.render('pedido', {
    titulo: `Pedido ${p.codigo}`,
    pedido: p,
    puedeCancelar: esDueno && p.estado === 'pendiente',
    scripts: ['comun', 'pedidos'],
  });
}

// GET /admin — el rol se vuelve a leer desde la BD (no basta la sesión).
// Para quien no es admin la página "no existe" (no se revela el panel).
async function admin(req, res, next) {
  const usuario = await Usuario.buscarPorId(req.session.usuario.id);
  if (!usuario || !usuario.activo || usuario.rol !== 'admin') return next(noEncontrada());
  res.render('admin', {
    titulo: 'Panel de administración',
    falta2fa: !usuario.totp_activo,
    sesionSin2fa: usuario.totp_activo && !req.session.usuario.mfa,
    scripts: ['comun', 'admin'],
  });
}

module.exports = { registro, recuperar, cuenta, misPedidos, seguimiento, pedido, admin };
