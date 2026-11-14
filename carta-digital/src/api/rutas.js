// Tabla única de rutas de la API. De aquí salen el router de Express y la
// documentación OpenAPI, así la documentación nunca queda desactualizada.
//   acceso: 'publico' | 'login' | 'admin'
const S = require('./schemas');
const publico = require('./controllers/publicoController');
const auth = require('./controllers/authController');
const carrito = require('./controllers/carritoController');
const pedido = require('./controllers/pedidoController');
const admin = require('./controllers/adminController');
const L = require('../middlewares/limites');

const P = S.params;

module.exports = [
  // ---------------- Autenticación
  { metodo: 'get', ruta: '/auth/csrf', tag: 'Autenticación', resumen: 'Obtener el token CSRF', descripcion: 'Todo POST/PATCH/DELETE debe enviar este token en la cabecera X-CSRF-Token. Llama a este endpoint primero (crea la cookie de sesión).', h: auth.csrf },
  { metodo: 'post', ruta: '/auth/registro', tag: 'Autenticación', resumen: 'Crear una cuenta de cliente', descripcion: 'Contraseña de 10+ caracteres con letras y números. Inicia sesión automáticamente.', body: S.registro, limite: L.limiteRegistro, status: 201, h: auth.registro },
  { metodo: 'post', ruta: '/auth/login', tag: 'Autenticación', resumen: 'Iniciar sesión', descripcion: 'Máximo 5 intentos fallidos cada 15 min por IP. Devuelve un nuevo token CSRF.', body: S.login, limite: L.limiteLogin, h: auth.login },
  { metodo: 'post', ruta: '/auth/logout', tag: 'Autenticación', resumen: 'Cerrar sesión', h: auth.logout },
  { metodo: 'get', ruta: '/auth/yo', tag: 'Autenticación', resumen: 'Usuario con sesión iniciada', acceso: 'login', h: auth.yo },
  { metodo: 'patch', ruta: '/auth/yo/password', tag: 'Autenticación', resumen: 'Cambiar mi contraseña', descripcion: 'Cierra las sesiones de otros dispositivos y avisa por correo.', acceso: 'login', body: S.cambioPassword, limite: L.limiteLogin, h: auth.cambiarPassword },

  // ---------------- Seguridad de la cuenta
  { metodo: 'post', ruta: '/auth/2fa/verificar', tag: 'Seguridad de la cuenta', resumen: 'Login paso 2: código de la app (o de respaldo)', descripcion: 'Después de POST /auth/login con requiere2fa=true. Un mismo código no sirve dos veces. 5 códigos incorrectos bloquean la cuenta.', body: S.verificar2fa, limite: L.limiteLogin, h: auth.verificar2fa },
  { metodo: 'post', ruta: '/auth/2fa/configurar', tag: 'Seguridad de la cuenta', resumen: 'Activar 2FA (1/2): obtener el código QR', acceso: 'login', h: auth.configurar2fa },
  { metodo: 'post', ruta: '/auth/2fa/activar', tag: 'Seguridad de la cuenta', resumen: 'Activar 2FA (2/2): confirmar con un código', descripcion: 'Devuelve 8 códigos de respaldo que se muestran UNA sola vez.', acceso: 'login', body: S.activar2fa, limite: L.limiteLogin, h: auth.activar2fa },
  { metodo: 'post', ruta: '/auth/2fa/desactivar', tag: 'Seguridad de la cuenta', resumen: 'Desactivar 2FA (no permitido a admins)', acceso: 'login', body: S.desactivar2fa, limite: L.limiteLogin, h: auth.desactivar2fa },
  { metodo: 'post', ruta: '/auth/2fa/respaldo', tag: 'Seguridad de la cuenta', resumen: 'Generar nuevos códigos de respaldo', acceso: 'login', body: S.verificar2fa, limite: L.limiteLogin, h: auth.regenerarRespaldo },
  { metodo: 'post', ruta: '/auth/password/olvide', tag: 'Seguridad de la cuenta', resumen: 'Olvidé mi contraseña: enviar código por correo', descripcion: 'Responde lo mismo exista o no la cuenta. El código vence en 15 min y sirve una vez.', body: S.olvidePassword, limite: L.limiteRecuperacion, h: auth.olvidePassword },
  { metodo: 'post', ruta: '/auth/password/restablecer', tag: 'Seguridad de la cuenta', resumen: 'Restablecer contraseña con el código del correo', descripcion: 'Si la cuenta tiene 2FA también pide codigo2fa. Cierra todas las sesiones.', body: S.restablecerPassword, limite: L.limiteRecuperacion, h: auth.restablecerPassword },
  { metodo: 'get', ruta: '/auth/sesiones', tag: 'Seguridad de la cuenta', resumen: 'Mis sesiones abiertas (IP, navegador, inicio)', acceso: 'login', h: auth.listarSesiones },
  { metodo: 'post', ruta: '/auth/sesiones/cerrar-todas', tag: 'Seguridad de la cuenta', resumen: 'Cerrar todas mis sesiones', descripcion: 'Por defecto mantiene la actual; con incluirActual=true cierra todas.', acceso: 'login', body: S.cerrarSesiones, h: auth.cerrarTodasSesiones },
  { metodo: 'delete', ruta: '/auth/sesiones/:id', tag: 'Seguridad de la cuenta', resumen: 'Cerrar una sesión específica', acceso: 'login', params: P.sesion, h: auth.cerrarSesionPorId },

  // ---------------- Restaurantes y carta
  { metodo: 'get', ruta: '/restaurantes', tag: 'Restaurantes', resumen: 'Listar y buscar restaurantes', query: S.listarRestaurantes, h: publico.listarRestaurantes },
  { metodo: 'get', ruta: '/restaurantes/:id', tag: 'Restaurantes', resumen: 'Detalle de un restaurante con resumen', params: P.id, h: publico.verRestaurante },
  { metodo: 'get', ruta: '/restaurantes/:id/carta', tag: 'Restaurantes', resumen: 'Carta completa (cartas → categorías → platos)', params: P.id, h: publico.verCarta },
  { metodo: 'get', ruta: '/restaurantes/:id/destacados', tag: 'Restaurantes', resumen: 'Platos destacados', params: P.id, h: publico.destacados },
  { metodo: 'get', ruta: '/restaurantes/:id/platos', tag: 'Restaurantes', resumen: 'Buscar y filtrar platos del restaurante', descripcion: 'Filtros por texto, rango de precio y destacados; orden por nombre, precio o puntuación.', params: P.id, query: S.buscarPlatos, h: publico.platosRestaurante },
  { metodo: 'get', ruta: '/platos/buscar', tag: 'Restaurantes', resumen: 'Buscar platos en todos los restaurantes', query: S.buscarPlatosGlobal, h: publico.buscarPlatos },

  // ---------------- Comentarios
  { metodo: 'get', ruta: '/restaurantes/:id/comentarios', tag: 'Comentarios', resumen: 'Comentarios del restaurante (paginados)', params: P.id, query: S.soloPaginacion, h: publico.comentarios },
  { metodo: 'post', ruta: '/restaurantes/:id/comentarios', tag: 'Comentarios', resumen: 'Publicar un comentario', descripcion: 'El autor se toma de la sesión. Máx. 10 por hora.', acceso: 'login', params: P.id, body: S.nuevoComentario, limite: L.limiteComentarios, status: 201, h: publico.comentar },

  // ---------------- Carrito
  { metodo: 'get', ruta: '/restaurantes/:id/carrito', tag: 'Carrito', resumen: 'Ver mi carrito', descripcion: 'Es el mismo carrito de la web (misma sesión).', params: P.id, h: carrito.ver },
  { metodo: 'post', ruta: '/restaurantes/:id/carrito', tag: 'Carrito', resumen: 'Agregar un producto', params: P.id, body: S.agregarCarrito, h: carrito.agregar },
  { metodo: 'patch', ruta: '/restaurantes/:id/carrito/:itemId', tag: 'Carrito', resumen: 'Cambiar la cantidad (0 = quitar)', params: P.itemId, body: S.cantidadCarrito, h: carrito.cambiarCantidad },
  { metodo: 'delete', ruta: '/restaurantes/:id/carrito/:itemId', tag: 'Carrito', resumen: 'Quitar un producto', params: P.itemId, h: carrito.quitar },
  { metodo: 'delete', ruta: '/restaurantes/:id/carrito', tag: 'Carrito', resumen: 'Vaciar el carrito', params: P.id, h: carrito.vaciar },

  // ---------------- Pedidos
  { metodo: 'post', ruta: '/restaurantes/:id/pedidos', tag: 'Pedidos', resumen: 'Confirmar un pedido', descripcion: 'Sin "items" se confirma el carrito de la sesión (y se vacía). Precios siempre desde la BD. No requiere cuenta. Máx. 20 por hora.', params: P.id, body: S.nuevoPedido, limite: L.limitePedidos, status: 201, h: pedido.crear },
  { metodo: 'get', ruta: '/pedidos/:codigo', tag: 'Pedidos', resumen: 'Seguimiento de un pedido por código', params: P.codigo, h: pedido.seguimiento },
  { metodo: 'post', ruta: '/pedidos/:codigo/cancelar', tag: 'Pedidos', resumen: 'Cancelar mi pedido (solo si está pendiente)', params: P.codigo, h: pedido.cancelar },
  { metodo: 'get', ruta: '/mis-pedidos', tag: 'Pedidos', resumen: 'Historial de mis pedidos', acceso: 'login', query: S.soloPaginacion, h: pedido.misPedidos },

  // ---------------- Administración
  { metodo: 'get', ruta: '/admin/estadisticas', tag: 'Admin · Reportes', resumen: 'Ventas, pedidos por estado y platos más pedidos', acceso: 'admin', query: S.rangoFechas, h: admin.estadisticas },
  { metodo: 'get', ruta: '/admin/auditoria', tag: 'Admin · Reportes', resumen: 'Registro de auditoría', acceso: 'admin', query: S.listarAuditoria, h: admin.auditoria },

  { metodo: 'get', ruta: '/admin/restaurantes', tag: 'Admin · Catálogo', resumen: 'Listar restaurantes (incluye eliminados si se pide)', acceso: 'admin', query: S.listarAdminRestaurantes, h: admin.listarRestaurantes },
  { metodo: 'post', ruta: '/admin/restaurantes', tag: 'Admin · Catálogo', resumen: 'Crear restaurante', acceso: 'admin', body: S.crearRestaurante, status: 201, h: admin.crearRestaurante },
  { metodo: 'get', ruta: '/admin/restaurantes/:id', tag: 'Admin · Catálogo', resumen: 'Restaurante con su carta completa (incluye lo oculto)', acceso: 'admin', params: P.id, h: admin.verRestaurante },
  { metodo: 'patch', ruta: '/admin/restaurantes/:id', tag: 'Admin · Catálogo', resumen: 'Editar restaurante', acceso: 'admin', params: P.id, body: S.editarRestaurante, h: admin.editarRestaurante },
  { metodo: 'delete', ruta: '/admin/restaurantes/:id', tag: 'Admin · Catálogo', resumen: 'Eliminar restaurante (borrado lógico)', acceso: 'admin', params: P.id, h: admin.eliminarRestaurante },
  { metodo: 'post', ruta: '/admin/restaurantes/:id/restaurar', tag: 'Admin · Catálogo', resumen: 'Restaurar restaurante eliminado', acceso: 'admin', params: P.id, h: admin.restaurarRestaurante },

  { metodo: 'post', ruta: '/admin/restaurantes/:id/cartas', tag: 'Admin · Catálogo', resumen: 'Crear carta', acceso: 'admin', params: P.id, body: S.crearCarta, status: 201, h: admin.crearCarta },
  { metodo: 'patch', ruta: '/admin/cartas/:id', tag: 'Admin · Catálogo', resumen: 'Editar carta', acceso: 'admin', params: P.id, body: S.editarCarta, h: admin.editarCarta },
  { metodo: 'delete', ruta: '/admin/cartas/:id', tag: 'Admin · Catálogo', resumen: 'Eliminar carta', acceso: 'admin', params: P.id, h: admin.eliminarCarta },

  { metodo: 'post', ruta: '/admin/cartas/:id/categorias', tag: 'Admin · Catálogo', resumen: 'Crear categoría', acceso: 'admin', params: P.id, body: S.crearCategoria, status: 201, h: admin.crearCategoria },
  { metodo: 'patch', ruta: '/admin/categorias/:id', tag: 'Admin · Catálogo', resumen: 'Editar categoría', acceso: 'admin', params: P.id, body: S.editarCategoria, h: admin.editarCategoria },
  { metodo: 'delete', ruta: '/admin/categorias/:id', tag: 'Admin · Catálogo', resumen: 'Eliminar categoría', acceso: 'admin', params: P.id, h: admin.eliminarCategoria },

  { metodo: 'post', ruta: '/admin/categorias/:id/items', tag: 'Admin · Catálogo', resumen: 'Crear plato', acceso: 'admin', params: P.id, body: S.crearItem, status: 201, h: admin.crearItem },
  { metodo: 'patch', ruta: '/admin/items/:id', tag: 'Admin · Catálogo', resumen: 'Editar plato (precio, visible, destacado...)', acceso: 'admin', params: P.id, body: S.editarItem, h: admin.editarItem },
  { metodo: 'delete', ruta: '/admin/items/:id', tag: 'Admin · Catálogo', resumen: 'Eliminar plato', acceso: 'admin', params: P.id, h: admin.eliminarItem },

  { metodo: 'get', ruta: '/admin/comentarios', tag: 'Admin · Moderación', resumen: 'Listar comentarios', acceso: 'admin', query: S.listarComentariosAdmin, h: admin.listarComentarios },
  { metodo: 'patch', ruta: '/admin/comentarios/:id', tag: 'Admin · Moderación', resumen: 'Ocultar o mostrar un comentario', acceso: 'admin', params: P.id, body: S.moderarComentario, h: admin.moderarComentario },
  { metodo: 'delete', ruta: '/admin/comentarios/:id', tag: 'Admin · Moderación', resumen: 'Eliminar un comentario', acceso: 'admin', params: P.id, h: admin.eliminarComentario },

  { metodo: 'get', ruta: '/admin/usuarios', tag: 'Admin · Usuarios', resumen: 'Listar usuarios', acceso: 'admin', query: S.listarUsuarios, h: admin.listarUsuarios },
  { metodo: 'patch', ruta: '/admin/usuarios/:id', tag: 'Admin · Usuarios', resumen: 'Cambiar rol o activar/desactivar', descripcion: 'Desactivar una cuenta cierra sus sesiones al instante.', acceso: 'admin', params: P.id, body: S.editarUsuario, h: admin.editarUsuario },
  { metodo: 'post', ruta: '/admin/usuarios/:id/desbloquear', tag: 'Admin · Usuarios', resumen: 'Quitar el bloqueo por intentos fallidos', acceso: 'admin', params: P.id, h: admin.desbloquearUsuario },
  { metodo: 'post', ruta: '/admin/usuarios/:id/cerrar-sesiones', tag: 'Admin · Usuarios', resumen: 'Cerrar todas las sesiones de un usuario', acceso: 'admin', params: P.id, h: admin.cerrarSesionesUsuario },
  { metodo: 'post', ruta: '/admin/usuarios/:id/2fa/reiniciar', tag: 'Admin · Usuarios', resumen: 'Reiniciar el 2FA de un usuario (perdió el teléfono)', acceso: 'admin', params: P.id, h: admin.reiniciar2faUsuario },

  { metodo: 'get', ruta: '/admin/alertas', tag: 'Admin · Alertas de seguridad', resumen: 'Alertas de seguridad (pendientes primero)', descripcion: 'Tipos: cuenta_bloqueada, ataque_multiples_cuentas, fuerza_bruta_masiva, login_ip_nueva, login_ips_multiples, 2fa_fallido_repetido.', acceso: 'admin', query: S.listarAlertas, h: admin.listarAlertas },
  { metodo: 'patch', ruta: '/admin/alertas/:id', tag: 'Admin · Alertas de seguridad', resumen: 'Marcar una alerta como revisada', acceso: 'admin', params: P.id, body: S.revisarAlerta, h: admin.revisarAlerta },

  { metodo: 'get', ruta: '/admin/pedidos', tag: 'Admin · Pedidos', resumen: 'Listar pedidos con filtros', acceso: 'admin', query: S.listarPedidos, h: admin.listarPedidos },
  { metodo: 'get', ruta: '/admin/pedidos/:id', tag: 'Admin · Pedidos', resumen: 'Detalle de un pedido', acceso: 'admin', params: P.id, h: admin.verPedido },
  { metodo: 'patch', ruta: '/admin/pedidos/:id/estado', tag: 'Admin · Pedidos', resumen: 'Avanzar el estado del pedido', descripcion: 'pendiente → preparando → listo → entregado (o cancelado desde pendiente/preparando).', acceso: 'admin', params: P.id, body: S.cambiarEstado, h: admin.cambiarEstadoPedido },
];
