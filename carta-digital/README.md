# Carta Digital — Node.js + Express + PostgreSQL (MVC) · Backend v2

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
| **API REST v1** (63 endpoints, ver sección 7) | `/api/v1/...` |
| **Documentación interactiva (Swagger)** | `GET /api/docs` |

---

## 1.1 Novedades del backend v2

El **front-end no cambia** (`src/views/` y `public/` quedan idénticos). Todo lo
nuevo es del lado del servidor y se usa por la API:

| Funcionalidad | Detalle |
|---|---|
| **API REST JSON** `/api/v1` | Restaurantes, carta, búsqueda y filtros de platos, comentarios, carrito, pedidos |
| **Pedidos guardados en BD** | El carrito se confirma como pedido con código de seguimiento (`K7P2QX9M`). Estados `pendiente → preparando → listo → entregado` (o `cancelado`) |
| **Cuentas de usuario** | Registro, login, "quién soy", cambio de contraseña. Roles `cliente` y `admin` |
| **Administración** | CRUD de restaurantes, cartas, categorías y platos (borrado lógico y restaurar), moderación de comentarios, gestión de usuarios, cocina (estado de pedidos) |
| **Reportes** | Ventas, ticket promedio, pedidos por estado, platos más pedidos, ventas por día |
| **Auditoría** | Tabla `auditoria`: logins (ok/fallidos), registros, pedidos, cambios del admin, con usuario, IP y fecha. La app solo puede INSERTAR en ella, no modificarla |
| **Logs estructurados** | JSON con `pino` (listos para CloudWatch), id por petición (`X-Request-Id`), sin contraseñas ni cookies |
| **Validación con Zod** | Todo lo que entra por la API se valida; campos desconocidos se rechazan (anti *mass assignment*) |
| **Documentación OpenAPI** | Generada automáticamente desde las rutas y esquemas (`src/api/rutas.js`), nunca queda desactualizada |

## 1.2 Seguridad de cuentas

| Función | Cómo funciona |
|---|---|
| **Bloqueo por cuenta** | 5 intentos fallidos en 15 min bloquean **ese correo** 15 min, aunque el atacante cambie de IP (complementa el límite por IP). El bloqueo se aplica también a correos que no existen, así no sirve para averiguar qué cuentas hay. El dueño recibe un correo; el admin puede desbloquear. Los códigos 2FA incorrectos también cuentan. |
| **Doble factor (2FA / TOTP)** | Compatible con Google Authenticator, Microsoft Authenticator y Authy. Código QR, 8 códigos de respaldo de un solo uso, **anti-replay** (un código no sirve dos veces), secreto **cifrado con AES-256-GCM** en la BD. **Obligatorio para administradores**: sin 2FA, o con una sesión iniciada sin código, `/admin` responde 403. En el formulario web (que no cambió) se escribe la contraseña seguida del código de 6 dígitos. |
| **Recuperar contraseña** | Código por correo (Amazon SES) de 32 bytes aleatorios, válido 15 min y un solo uso. En la BD solo queda su hash SHA-256. Pedir uno nuevo invalida los anteriores. La respuesta es igual exista o no la cuenta, y el correo se envía en segundo plano (mismo tiempo de respuesta). El enlace usa `APP_URL`, nunca la cabecera `Host` (anti *host header injection*). Si la cuenta tiene 2FA, también pide el código. Al restablecer se cierran todas las sesiones. |
| **Cerrar sesiones** | Ver mis sesiones abiertas (IP, navegador, inicio) y cerrar todas o una. Nunca se expone el id real de sesión. Cambiar la contraseña, desactivar una cuenta o reiniciar su 2FA cierra sus sesiones. |
| **Alertas de seguridad** | Tabla `alertas_seguridad` + correo. Detecta: cuenta bloqueada, una IP probando muchas cuentas (*credential stuffing*, alta), fuerza bruta masiva (alta), login desde IP nueva (correo al usuario), misma cuenta desde 3+ IPs en una hora, contraseña correcta con códigos 2FA incorrectos repetidos (alta: "alguien conoce tu contraseña"). Las altas se envían por correo a los admins. |

---

## 2. Arquitectura MVC

```
carta-digital/
├── src/
│   ├── server.js            # Levanta el servidor (apagado ordenado con SIGTERM)
│   ├── app.js               # Configuración de Express: helmet, sesiones, CSRF, rutas
│   ├── config/
│   │   ├── env.js           # Variables de entorno validadas (.env)
│   │   ├── db.js            # Pool de PostgreSQL + transacciones (solo consultas parametrizadas)
│   │   └── logger.js        # Logs JSON (pino) con datos sensibles ocultos
│   ├── models/              # M — acceso a datos
│   │   ├── restauranteModel.js  cartaModel.js  comentarioModel.js
│   │   ├── usuarioModel.js      pedidoModel.js auditoriaModel.js
│   │   └── catalogoAdminModel.js
│   ├── views/               # V — plantillas EJS (escapan HTML por defecto)
│   │   ├── partials/ (head, footer, plato)
│   │   ├── inicio.ejs  carta.ejs  carrito.ejs  error.ejs
│   ├── controllers/         # C — lógica de cada caso de uso
│   │   ├── cartaController.js
│   │   ├── carritoController.js
│   │   ├── comentarioController.js
│   │   └── authController.js
│   ├── routes/index.js      # Rutas de la web (HTML)
│   ├── api/                 # API REST v1
│   │   ├── rutas.js         # Tabla única de endpoints (genera router + Swagger)
│   │   ├── schemas.js       # Validación Zod de params, query y body
│   │   ├── validar.js       # Middleware de validación
│   │   ├── acceso.js        # requiereLogin / requiereAdmin
│   │   ├── openapi.js       # Especificación OpenAPI 3
│   │   └── controllers/     # publico, auth, carrito, pedido, admin
│   ├── services/            # Lógica compartida web + API: carrito, autenticación, bloqueo,
│   │                        # 2FA (totp), recuperación, sesiones, alertas, correo (SES), cifrado
│   ├── middlewares/         # csrf.js, auth.js, errores.js, limites.js
│   └── utils/               # validacion.js, formato.js, async.js, http.js
├── public/                  # CSS, JS del navegador e imágenes
├── db/init/                 # 01_schema, 02_datos, 03_usuario_app, 04_backend_v2, 05_permisos_v2,
│                            # 06_seguridad, 07_permisos_seguridad
├── scripts/                 # init-db.js, migrar-db.js, crear-usuario.js
└── tests/                   # seguridad (23) + api (45) + seguridad-cuentas (23) = 91 pruebas
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
psql -d carta_digital -f db/init/01_schema.sql -f db/init/02_datos.sql -f db/init/04_backend_v2.sql -f db/init/06_seguridad.sql
# Rol de la app con privilegios mínimos (recomendado):
APP_DB_USER=carta_app APP_DB_PASSWORD='clave_segura' POSTGRES_USER=postgres POSTGRES_DB=carta_digital sh db/init/03_usuario_app.sh
APP_DB_USER=carta_app POSTGRES_USER=postgres POSTGRES_DB=carta_digital sh db/init/05_permisos_v2.sh
APP_DB_USER=carta_app POSTGRES_USER=postgres POSTGRES_DB=carta_digital sh db/init/07_permisos_seguridad.sh
```

**¿Ya tenías la base de la versión 1 (por ejemplo en RDS)?** No hay que
recrearla: con credenciales de administrador en el `.env` ejecuta

```bash
npm run db:migrate                     # aplica 04_backend_v2.sql y 06_seguridad.sql (idempotente)
APP_DB_USER=carta_app POSTGRES_USER=... POSTGRES_DB=... sh db/init/05_permisos_v2.sh
APP_DB_USER=carta_app POSTGRES_USER=... POSTGRES_DB=... sh db/init/07_permisos_seguridad.sh
```

> Alternativa: `npm run db:init` crea las tablas usando las credenciales del `.env`.

Crear un usuario para iniciar sesión (contraseña hasheada con bcrypt; requiere
credenciales de BD con permiso de INSERT en `usuarios`, no las del rol `carta_app`):

```bash
npm run crear-usuario     # cliente
npm run crear-admin       # administrador (acceso a /api/v1/admin/...)
```

> El administrador debe **activar 2FA** antes de usar `/admin`: inicia sesión
> por la API, `POST /api/v1/auth/2fa/configurar` (abre el `qr` en el navegador y
> escanéalo con Google Authenticator) y `POST /api/v1/auth/2fa/activar`.

Levantar la app:

```bash
npm run dev     # desarrollo, se reinicia al guardar
npm start       # normal
```

Abrir http://localhost:3000

---

## 4. Pruebas

```bash
NODE_ENV=test TEST_EMAIL=cliente@correo.cl TEST_PASSWORD='clave_cliente' npm test
```

**91 pruebas**: `seguridad.test.js` (web), `api.test.js` (API: inyección SQL,
CSRF, mass assignment, precios manipulados, control de acceso por rol, flujo de
pedidos, moderación, auditoría, fuerza bruta...) y `seguridad-cuentas.test.js`
(bloqueo por cuenta desde IPs distintas, 2FA con anti-replay y códigos de
respaldo, recuperación de contraseña con sus trampas clásicas, cierre de
sesiones y alertas). Los administradores de prueba se crean solos.

Ejecutar contra la base de **desarrollo o QA**, nunca producción (las pruebas
crean pedidos, comentarios y platos de prueba). Sin las variables `TEST_*` se
omiten las pruebas que necesitan iniciar sesión.

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
| **Sin control de roles** (backend v2) | Rol `admin` verificado **en la BD en cada petición**: quitar el rol o desactivar la cuenta corta el acceso al instante |
| **Mass assignment** (backend v2) | Esquemas Zod estrictos: `{"rol":"admin"}` en el registro → 400 |
| **IDOR en pedidos** (backend v2) | Código aleatorio de 8 caracteres (no correlativo); solo el dueño (cuenta o sesión) puede cancelar |
| **Sin trazabilidad** (backend v2) | Tabla `auditoria` (solo INSERT para la app) + logs JSON con `X-Request-Id` |
| **Path traversal en imágenes** (backend v2) | Solo nombres de archivo simples (`plato1.jpg`); `../../etc/passwd` → 400 |
| **Fuerza bruta distribuida** (seguridad de cuentas) | Bloqueo por correo además de por IP; alerta de *credential stuffing* |
| **Robo de contraseña** (seguridad de cuentas) | 2FA TOTP (obligatorio para admins), alerta "alguien conoce tu contraseña", cerrar todas las sesiones |
| **Recuperación de contraseña insegura** (seguridad de cuentas) | Token aleatorio con hash, 15 min, un uso, sin enumeración ni *host header injection* |

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
- **Autoscaling / Load Balancer:** la app no guarda estado en el contenedor
  (sesiones, carritos y pedidos están en PostgreSQL), así que se pueden levantar
  varias instancias detrás del balanceador sin "sticky sessions". El target group
  puede usar `GET /health` como health check.
- **RDS:** `DB_SSL=true` para conexión cifrada. La primera vez ejecutar los
  scripts de `db/init/` (o `npm run db:migrate` si la base ya existía).
- Variables nuevas opcionales: `LOG_LEVEL`, `API_DOCS` (Swagger, apagado por
  defecto en producción), `LIMITE_REGISTRO_HORA`, `LIMITE_PEDIDOS_HORA`, `LIMITE_API_5MIN`.
- **Correos con Amazon SES:** `CORREO_PROVEEDOR=ses`, `CORREO_REMITENTE` (dirección
  verificada en SES), `AWS_REGION`, `APP_URL`. Las credenciales salen del **rol IAM**
  de la instancia (permiso `ses:SendEmail`), sin claves en el código ni en el `.env`.
  Mientras la cuenta de SES esté en *sandbox* solo se puede enviar a correos verificados.
- `CIFRADO_CLAVE` (32+ caracteres) para cifrar los secretos 2FA.

---

## 7. API REST v1

Base: `/api/v1`. Documentación interactiva en **`/api/docs`** (Swagger) y
especificación en `/api/v1/openapi.json`.

Respuestas: `{ "ok": true, "datos": ..., "paginacion"?: {...} }` o
`{ "ok": false, "error": "...", "detalles"?: [{ "campo", "mensaje" }] }`.

**Autenticación:** la misma cookie de sesión de la web (`carta.sid`). Todo
`POST/PATCH/DELETE` exige el token en la cabecera `X-CSRF-Token`
(se obtiene con `GET /api/v1/auth/csrf`; el login y el registro devuelven uno nuevo).

| Área | Endpoints |
|---|---|
| Autenticación | `GET /auth/csrf` · `POST /auth/registro` · `POST /auth/login` · `POST /auth/logout` · `GET /auth/yo` · `PATCH /auth/yo/password` |
| Seguridad de la cuenta | `POST /auth/2fa/verificar` · `POST /auth/2fa/configurar` · `POST /auth/2fa/activar` · `POST /auth/2fa/desactivar` · `POST /auth/2fa/respaldo` · `POST /auth/password/olvide` · `POST /auth/password/restablecer` · `GET /auth/sesiones` · `POST /auth/sesiones/cerrar-todas` · `DELETE /auth/sesiones/:id` |
| Restaurantes | `GET /restaurantes?q=&comuna=` · `GET /restaurantes/:id` · `/carta` · `/destacados` · `/platos?q=&precioMin=&precioMax=&destacado=&orden=` · `GET /platos/buscar?q=` |
| Comentarios | `GET /restaurantes/:id/comentarios` · `POST` (con sesión) |
| Carrito | `GET/POST/DELETE /restaurantes/:id/carrito` · `PATCH/DELETE /restaurantes/:id/carrito/:itemId` |
| Pedidos | `POST /restaurantes/:id/pedidos` · `GET /pedidos/:codigo` · `POST /pedidos/:codigo/cancelar` · `GET /mis-pedidos` |
| Admin · catálogo | `GET/POST /admin/restaurantes` · `GET/PATCH/DELETE /admin/restaurantes/:id` · `POST .../restaurar` · `POST /admin/restaurantes/:id/cartas` · `PATCH/DELETE /admin/cartas/:id` · `POST /admin/cartas/:id/categorias` · `PATCH/DELETE /admin/categorias/:id` · `POST /admin/categorias/:id/items` · `PATCH/DELETE /admin/items/:id` |
| Admin · seguridad | `GET /admin/alertas` · `PATCH /admin/alertas/:id` · `POST /admin/usuarios/:id/desbloquear` · `POST /admin/usuarios/:id/cerrar-sesiones` · `POST /admin/usuarios/:id/2fa/reiniciar` |
| Admin · otros | `GET/PATCH/DELETE /admin/comentarios` · `GET/PATCH /admin/usuarios` · `GET /admin/pedidos` · `GET /admin/pedidos/:id` · `PATCH /admin/pedidos/:id/estado` · `GET /admin/estadisticas` · `GET /admin/auditoria` |

Ejemplo rápido con `curl`:

```bash
B=http://localhost:3000/api/v1
TOKEN=$(curl -s -c c.txt $B/auth/csrf | node -pe "JSON.parse(require('fs').readFileSync(0)).datos.csrfToken")
curl -s -b c.txt -H "X-CSRF-Token: $TOKEN" -H 'Content-Type: application/json' \
     -d '{"itemId":5,"cantidad":2}' $B/restaurantes/1/carrito
curl -s -b c.txt -H "X-CSRF-Token: $TOKEN" -H 'Content-Type: application/json' \
     -d '{"mesa":"7"}' $B/restaurantes/1/pedidos          # → { codigo: "K7P2QX9M", total: 25000, ... }
```
