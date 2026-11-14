// Esquemas de validación (Zod) de todo lo que entra por la API.
// - z.strictObject rechaza campos no esperados: evita "mass assignment"
//   (por ejemplo, mandar { "rol": "admin" } al registrarse).
// - Los mismos esquemas generan la documentación OpenAPI (Swagger).
const { z } = require('zod');
const { ESTADOS } = require('../models/pedidoModel');
const { ORDENES } = require('../models/cartaModel');

const MAX_INT = 2147483647;

// ---- Piezas reutilizables
const id = z
  .string()
  .regex(/^[1-9]\d{0,9}$/, 'Debe ser un id numérico')
  .transform(Number)
  .refine((n) => n <= MAX_INT, 'Id fuera de rango')
  .meta({ type: 'integer', example: 1 });

const idBody = z.number().int().positive().max(MAX_INT);

const texto = (min, max) => z.string().trim().min(min, `Mínimo ${min} caracteres`).max(max, `Máximo ${max} caracteres`);
const textoOpcional = (max) => z.union([texto(1, max), z.null()]).optional();

// Texto de búsqueda: se escapan los comodines de LIKE (% _ \) para que se busquen literalmente.
const busqueda = texto(1, 100).transform((s) => s.replace(/[\\%_]/g, '\\$&'));

const entero = (min, max) => z.coerce.number().int().min(min).max(max);
const booleanoQuery = z.enum(['true', 'false']).transform((v) => v === 'true');
const fecha = z.iso.date();

// Solo nombres de archivo simples: evita rutas como ../../etc/passwd
const archivoImagen = z
  .string()
  .regex(/^[\w-]+\.(jpe?g|png|webp|gif)$/i, 'Nombre de imagen inválido (ej: plato1.jpg)')
  .nullable()
  .optional();

const email = z.email('Correo inválido').max(255).transform((e) => e.toLowerCase());

const password = z
  .string()
  .min(10, 'La contraseña debe tener al menos 10 caracteres')
  .max(128, 'La contraseña no puede superar 128 caracteres')
  .refine((p) => /[a-zA-Z]/.test(p) && /\d/.test(p), 'La contraseña debe combinar letras y números');

const paginacion = {
  pagina: entero(1, 100000).default(1),
  porPagina: entero(1, 100).default(20),
};

// ---- Parámetros de ruta
const params = {
  id: z.strictObject({ id }),
  itemId: z.strictObject({ id, itemId: id }),
  codigo: z.strictObject({ codigo: z.string().regex(/^[A-Z2-9]{8}$/, 'Código inválido').meta({ example: 'K7P2QX9M' }) }),
};

// ---- Público
const listarRestaurantes = z.strictObject({ q: busqueda.optional(), comuna: busqueda.optional(), ...paginacion });

const buscarPlatos = z.strictObject({
  q: busqueda.optional(),
  precioMin: entero(0, MAX_INT).optional(),
  precioMax: entero(0, MAX_INT).optional(),
  destacado: booleanoQuery.optional(),
  orden: z.enum(Object.keys(ORDENES)).default('nombre'),
  ...paginacion,
});

const buscarPlatosGlobal = buscarPlatos.extend({ q: busqueda.pipe(z.string().min(2, 'Escribe al menos 2 caracteres')) });

const soloPaginacion = z.strictObject(paginacion);

const nuevoComentario = z.strictObject({ comentario: texto(2, 1000) });

// ---- Carrito
const agregarCarrito = z.strictObject({ itemId: idBody, cantidad: z.number().int().min(1).max(20).default(1) });
const cantidadCarrito = z.strictObject({ cantidad: z.number().int().min(0).max(20) });

// ---- Pedidos
const nuevoPedido = z.strictObject({
  mesa: z.string().trim().regex(/^[\w-]{1,10}$/, 'Mesa inválida (máx. 10 letras/números)').optional(),
  nota: texto(1, 300).optional(),
  // Si no se envían ítems, se usa el carrito de la sesión.
  items: z
    .array(z.strictObject({ itemId: idBody, cantidad: z.number().int().min(1).max(20) }))
    .min(1)
    .max(50)
    .optional(),
});

// ---- Autenticación
const registro = z.strictObject({ nombre: texto(2, 100), email, password });
const login = z.strictObject({ email: z.string().max(255), password: z.string().max(128) });
const cambioPassword = z
  .strictObject({ passwordActual: z.string().min(1).max(128), passwordNueva: password })
  .refine((d) => d.passwordActual !== d.passwordNueva, { message: 'La nueva contraseña debe ser distinta', path: ['passwordNueva'] });

// ---- Admin: catálogo
const direccion = z.strictObject({
  calle: texto(1, 100),
  numero: texto(1, 15),
  comuna: texto(1, 100),
  region: textoOpcional(100),
});

const restauranteBase = {
  rut: z.string().trim().regex(/^\d{7,8}-[\dkK]$/, 'RUT inválido (ej: 76543210-K)'),
  nombre: texto(2, 200),
  fono: texto(6, 45),
  mapa: textoOpcional(200),
  foto: archivoImagen,
  email: z.union([z.email('Correo inválido').max(100), z.null()]).optional(),
};
const crearRestaurante = z.strictObject({ ...restauranteBase, direccion });
const editarRestaurante = z
  .strictObject({ ...restauranteBase, direccion: direccion.partial() })
  .partial()
  .refine((d) => Object.keys(d).length > 0, 'Envía al menos un campo');

const orden = z.number().int().min(0).max(10000).nullable().optional();

const crearCarta = z.strictObject({ nombre: texto(1, 45), orden, visible: z.boolean().default(true), foto: archivoImagen });
const crearCategoria = z.strictObject({ nombre: texto(1, 100), orden, visible: z.boolean().default(true), foto: archivoImagen });
const crearItem = z.strictObject({
  nombre: texto(1, 100),
  descripcion: textoOpcional(300),
  tiempo: textoOpcional(100),
  observaciones: textoOpcional(300),
  precio: z.number().int().min(0).max(100000000),
  visible: z.boolean().default(true),
  destacado: z.boolean().default(false),
  puntuacion: z.number().int().min(0).max(5).default(0),
  foto: archivoImagen,
  orden,
});

// En la edición todo es opcional y sin valores por defecto.
const parcial = (esquema) =>
  z
    .strictObject(
      Object.fromEntries(
        Object.entries(esquema.shape).map(([k, v]) => [k, (v.unwrap && v.def.type === 'default' ? v.unwrap() : v).optional()])
      )
    )
    .refine((d) => Object.keys(d).length > 0, 'Envía al menos un campo');

const editarCarta = parcial(crearCarta);
const editarCategoria = parcial(crearCategoria);
const editarItem = parcial(crearItem);

// ---- Admin: otros
const listarAdminRestaurantes = z.strictObject({ incluirEliminados: booleanoQuery.optional(), ...paginacion });
const listarComentariosAdmin = z.strictObject({ restaurante: entero(1, MAX_INT).optional(), oculto: booleanoQuery.optional(), ...paginacion });
const moderarComentario = z.strictObject({ oculto: z.boolean() });

const listarUsuarios = z.strictObject({ q: busqueda.optional(), rol: z.enum(['cliente', 'admin']).optional(), ...paginacion });
const editarUsuario = z
  .strictObject({ rol: z.enum(['cliente', 'admin']).optional(), activo: z.boolean().optional() })
  .refine((d) => d.rol !== undefined || d.activo !== undefined, 'Envía rol o activo');

const listarPedidos = z.strictObject({
  estado: z.enum(ESTADOS).optional(),
  restaurante: entero(1, MAX_INT).optional(),
  desde: fecha.optional(),
  hasta: fecha.optional(),
  ...paginacion,
});
const cambiarEstado = z.strictObject({ estado: z.enum(ESTADOS) });
const rangoFechas = z.strictObject({ desde: fecha.optional(), hasta: fecha.optional() });

const listarAuditoria = z.strictObject({
  accion: z.string().regex(/^[a-z_]{1,60}$/).optional(),
  usuario: entero(1, MAX_INT).optional(),
  entidad: z.string().regex(/^[a-z_]{1,40}$/).optional(),
  ...paginacion,
});

module.exports = {
  params,
  listarRestaurantes,
  buscarPlatos,
  buscarPlatosGlobal,
  soloPaginacion,
  nuevoComentario,
  agregarCarrito,
  cantidadCarrito,
  nuevoPedido,
  registro,
  login,
  cambioPassword,
  crearRestaurante,
  editarRestaurante,
  crearCarta,
  editarCarta,
  crearCategoria,
  editarCategoria,
  crearItem,
  editarItem,
  listarAdminRestaurantes,
  listarComentariosAdmin,
  moderarComentario,
  listarUsuarios,
  editarUsuario,
  listarPedidos,
  cambiarEstado,
  rangoFechas,
  listarAuditoria,
};
