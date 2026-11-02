# Carta Digital — Node.js + Express + PostgreSQL (MVC)

Tercera entrega de **Desarrollo Seguro**: la carta digital de `pnkSecurity`
(PHP + MySQL) reescrita en **Node.js + Express + PostgreSQL** con arquitectura
**MVC**, corrigiendo desde el diseño las vulnerabilidades encontradas en el
informe de pentesting.

> Esta carpeta cubre **back-end y front-end**. Docker, los 3 ambientes
> (desarrollo / QA / producción) y la publicación (Git, Cloudflare, AWS) se
> configuran aparte; la app ya está preparada para eso (ver sección 6).

---

## 1. Funcionalidades

| Funcionalidad | Ruta |
|---|---|
| Listado de restaurantes | `GET /` |
| Carta del restaurante (destacados, cartas → categorías → platos) | `GET /restaurantes/:id` |
| Ver pedido (carrito) | `GET /restaurantes/:id/carrito` |
| Agregar / quitar / vaciar pedido | `POST /restaurantes/:id/carrito[/eliminar\|/vaciar]` |
| Publicar comentario (requiere sesión) | `POST /restaurantes/:id/comentarios` |
| Iniciar / cerrar sesión | `POST /login`, `POST /logout` |
| Healthcheck (Docker / balanceador) | `GET /health` |
| URL antigua `index.php?id=1` | redirige a `/restaurantes/1` |

---

## 2. Arquitectura MVC

```
carta-digital/
├── src/
│   ├── server.js            # Levanta el servidor (apagado ordenado con SIGTERM)
│   ├── app.js               # Configuración de Express: helmet, sesiones, CSRF, rutas
│   ├── config/
│   │   ├── env.js           # Variables de entorno validadas (.env)
│   │   └── db.js            # Pool de PostgreSQL (solo consultas parametrizadas)
│   ├── models/              # M — acceso a datos
│   │   ├── restauranteModel.js
│   │   ├── cartaModel.js
│   │   ├── comentarioModel.js
│   │   └── usuarioModel.js
│   ├── views/               # V — plantillas EJS (escapan HTML por defecto)
│   │   ├── partials/ (head, footer, plato)
│   │   ├── inicio.ejs  carta.ejs  carrito.ejs  error.ejs
│   ├── controllers/         # C — lógica de cada caso de uso
│   │   ├── cartaController.js
│   │   ├── carritoController.js
│   │   ├── comentarioController.js
│   │   └── authController.js
│   ├── routes/index.js      # Mapa de rutas + rate limiting
│   ├── middlewares/         # csrf.js, auth.js, errores.js
│   └── utils/               # validacion.js, formato.js, async.js
├── public/                  # CSS, JS del navegador e imágenes
├── db/init/                 # 01_schema.sql, 02_datos.sql, 03_usuario_app.sh
├── scripts/                 # init-db.js, crear-usuario.js
└── tests/                   # seguridad.test.js (23 pruebas)
```

Flujo de una petición: **ruta → middlewares (helmet, sesión, CSRF, login) →
controlador → modelo (PostgreSQL) → vista EJS → respuesta**.

---

## 3. Instalación local (sin Docker)

Requisitos: **Node.js 20+** y **PostgreSQL 14+**.

```bash
cd carta-digital
npm install
cp .env.example .env        # completar DB_* y SESSION_SECRET
```

Crear la base (con un usuario administrador de PostgreSQL):

```bash
createdb carta_digital
psql -d carta_digital -f db/init/01_schema.sql -f db/init/02_datos.sql
# Rol de la app con privilegios mínimos (recomendado):
APP_DB_USER=carta_app APP_DB_PASSWORD='clave_segura' POSTGRES_USER=postgres POSTGRES_DB=carta_digital sh db/init/03_usuario_app.sh
```

> Alternativa: `npm run db:init` crea las tablas usando las credenciales del `.env`.

Crear un usuario para iniciar sesión (contraseña hasheada con bcrypt; requiere
credenciales de BD con permiso de INSERT en `usuarios`, no las del rol `carta_app`):

```bash
npm run crear-usuario
```

Levantar la app:

```bash
npm run dev     # desarrollo, se reinicia al guardar
npm start       # normal
```

Abrir http://localhost:3000

---

## 4. Pruebas

```bash
TEST_EMAIL=tu@correo.cl TEST_PASSWORD='tu_clave' npm test
```

Ejecutar contra la base de **desarrollo o QA**, nunca producción (las pruebas
publican comentarios de prueba). Sin `TEST_EMAIL`/`TEST_PASSWORD` se omiten las
2 pruebas que necesitan iniciar sesión.

`npm audit` → **0 vulnerabilidades** en las dependencias.

---

## 5. Seguridad: vulnerabilidades del original y cómo se corrigen

| Vulnerabilidad en pnkSecurity (PHP) | Corrección en Carta Digital |
|---|---|
| **Inyección SQL** en `index.php?id=`, `carrito.php`, `procesalogin.php`, `grcomentarios.php` (concatenación de `$_GET`/`$_POST`) | Todas las consultas usan parámetros `$1, $2` (`pg`). Además los ids se validan como enteros (`parseId`): `1 OR 1=1` → 404 |
| **Contraseñas en texto plano** en la tabla `usuarios` | Hash **bcrypt** (costo 12). El repositorio no contiene usuarios ni claves |
| **XSS almacenado** en comentarios (se imprimían sin escapar) | EJS escapa todo con `<%= %>`, **CSP** `script-src 'self'` sin scripts inline, longitud máxima |
| **Suplantación en comentarios** (el nombre venía del formulario) | El autor se toma de la sesión (`usuario_id`); solo usuarios autenticados comentan |
| **Sin protección CSRF** | Token sincronizado por sesión en todos los POST + cookie `SameSite=Lax` |
| **Fijación de sesión** | `session.regenerate()` al iniciar sesión |
| **Cookie de sesión robable** | Cookie `HttpOnly`, `Secure` en producción, expiración por inactividad (2 h), sesiones guardadas en PostgreSQL |
| **Fuerza bruta en el login** | Máx. 5 intentos fallidos / 15 min por IP (HTTP 429) |
| **Enumeración de usuarios** | Mensaje genérico y tiempo de respuesta constante (bcrypt también si el email no existe) |
| **Manipulación del carrito** (vaciar destruía la sesión; precios) | El carrito guarda solo ids; nombre y precio salen siempre de la BD; se valida que el plato sea del restaurante; límites de cantidad |
| **Logout por GET** | Solo `POST` con CSRF |
| **Redirección abierta** | `volver` solo acepta rutas internas (`//sitio.com` → `/`) |
| **Errores con detalles internos** | Manejador central: nunca muestra stack traces ni errores SQL |
| **Credenciales en el código** (`setup.php`) | Variables de entorno (`.env`, fuera de Git) validadas al iniciar |
| **Usuario de BD con todos los privilegios** | Rol `carta_app`: solo `SELECT`, `INSERT` en comentarios y la tabla de sesiones |
| **Librerías vulnerables** (jQuery 3.2.1, Bootstrap 4 antiguo) | Front-end sin dependencias externas (CSS y JS propios) |
| **Cabeceras de seguridad ausentes** | `helmet`: CSP, `frame-ancestors 'none'`, `nosniff`, HSTS en producción, sin `X-Powered-By` |
| **Sin integridad referencial** | Claves foráneas y `CHECK` en el esquema PostgreSQL |

---

## 6. Para Docker y los 3 ambientes (coordinar con el equipo)

La app **lee toda su configuración de variables de entorno**, así que el mismo
código sirve para desarrollo, QA y producción cambiando solo el `.env`:

| Variable | Desarrollo | QA | Producción |
|---|---|---|---|
| `NODE_ENV` | `development` | `qa` | `production` |
| `PORT` | `3000` | `3000` | `3000` |
| `DB_HOST` | `db` (servicio de compose) | `db` | host de la BD |
| `SESSION_SECRET` | cualquiera | aleatorio | aleatorio ≥ 32 caracteres |
| `TRUST_PROXY` | — | `1` si hay proxy | `1` (Nginx / Cloudflare) |

Notas para el contenedor:
- Comando: `node src/server.js` (o `npm start`); expone el puerto `PORT`.
- Healthcheck: `GET /health` → 200 si hay conexión a la BD, 503 si no.
- La imagen oficial de **postgres** ejecuta automáticamente los archivos de
  `db/init/` si se montan en `/docker-entrypoint-initdb.d` (definir
  `APP_DB_USER` y `APP_DB_PASSWORD` para crear el rol de la app).
- En producción la cookie es `Secure`: hay que servir por **HTTPS**
  (Cloudflare / Let's Encrypt).
- La app responde correctamente a `SIGTERM` (apagado ordenado de Docker).
