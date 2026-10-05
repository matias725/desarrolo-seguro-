# Desarrollo Seguro — pnkSecurity

Proyecto de la asignatura **Desarrollo Seguro**. Se parte de una aplicación web
con código vulnerable (`pnkSecurity`, un menú digital de restaurantes en PHP +
MySQL), se identifican sus vulnerabilidades, se corrigen y se despliega la
versión corregida en AWS con evidencia de testing.

- **Integrantes:** Matías Zepeda ([@matias725](https://github.com/matias725)), Joaquín Andrés Zambra Zúñiga ([@Joacooooooo](https://github.com/Joacooooooo))
- **Docente:** Jorge Cortés
- **Aplicación desplegada (corregida):** https://54-197-67-4.sslip.io/index.php?id=1

---

## 1. Estructura del repositorio (Git)

| Rama | Contenido |
|------|-----------|
| `main` | Proyecto original con el **código vulnerable** |
| `mejoras` | Proyecto con las **correcciones** de seguridad aplicadas |

Para comparar el código vulnerable con el corregido:

```bash
git clone https://github.com/matias725/desarrolo-seguro-.git
cd desarrolo-seguro-

git checkout main       # código original (vulnerable)
git checkout mejoras    # código corregido
git diff main..mejoras  # todas las diferencias
```

Cada corrección es un commit separado que referencia su ID de vulnerabilidad
(por ejemplo `fix(VUL001,VUL009,...): autenticación segura`).

### Estructura de carpetas

```
.
├── src/
│   ├── pnkSecurity/            # Código fuente de la aplicación (PHP)
│   └── Script_BD/              # Script de la base de datos + migración de seguridad
├── deploy/                     # Despliegue automatizado en AWS (EC2)
├── tests/                      # test_seguridad.py — repite los ataques
├── docs/
│   ├── informe_pentesting_inicial.docx
│   └── evidencias/             # Resultados de las pruebas
└── README.md
```

---

## 2. Tecnologías

- **Lenguaje:** PHP (procedural, sin framework), JavaScript (jQuery/AJAX)
- **Base de datos:** MySQL 8
- **Servidor:** Apache 2
- **Despliegue:** AWS EC2 (Ubuntu 24.04), HTTPS con Let's Encrypt

---

## 3. Instalación y ejecución local (XAMPP/WAMP)

```bash
git clone https://github.com/matias725/desarrolo-seguro-.git
cd desarrolo-seguro-
git checkout mejoras
```

1. Copiar `src/pnkSecurity/` al directorio web (`htdocs`).
2. Crear la base de datos e importar:
   ```bash
   mysql pnk_security < src/Script_BD/pnk_security.sql
   mysql pnk_security < src/Script_BD/migracion_seguridad.sql
   mysql pnk_security < src/Script_BD/migracion_seguridad_2.sql
   ```
3. Configurar credenciales (fuera del código, VUL019):
   ```bash
   cp src/pnkSecurity/setup/config.example.php src/pnkSecurity/setup/config.local.php
   # editar config.local.php con un usuario de BD sin privilegios de administrador
   ```
4. Abrir `http://localhost/pnkSecurity/index.php?id=1`.

Usuarios de prueba: `admin@gmail.com` y `alondra@gmail.com`. Las claves no se
publican (VUL023). En local, define la tuya generando un hash bcrypt:

```bash
php -r 'echo password_hash("TU_CLAVE", PASSWORD_BCRYPT, ["cost" => 12]), "\n";'
mysql pnk_security -e "UPDATE usuarios SET password='<hash>' WHERE email='admin@gmail.com'"
```

En AWS las claves se generan al desplegar y solo root puede leerlas:
`sudo cat /root/pnk-credenciales.txt`.

---

## 4. Informe de vulnerabilidades y correcciones

Informe técnico inicial (22 hallazgos): [`docs/informe_pentesting_inicial.docx`](docs/informe_pentesting_inicial.docx).
Cada corrección está comentada en el código con su `VULxxx` y agrupada por commit.

| ID | Vulnerabilidad | OWASP 2021 | Sev. | Corrección | Estado |
|----|----------------|-----------|------|------------|--------|
| VUL-1 | SQLi en login (bypass de autenticación) | A03 | Crítica | Consulta preparada | ✅ |
| VUL-2..6 | SQLi en `index.php` y `mostrar_carrito.php` | A03 | Crítica | Consultas preparadas | ✅ |
| VUL-7 | SQLi en `carrito.php` | A03 | Crítica | Consulta preparada | ✅ |
| VUL-8 | SQLi en `grcomentarios.php` | A03 | Crítica | Consulta preparada | ✅ |
| VUL-9 | Contraseñas en texto plano | A02 | Crítica | bcrypt (`password_hash`) | ✅ |
| VUL-10 | XSS almacenado en comentarios | A03 | Alta | `htmlspecialchars` en salida | ✅ |
| VUL-11..13 | Ausencia de tokens CSRF | A01 | Alta/Media | Token CSRF por sesión | ✅ |
| VUL-14 | Autorización solo en cliente | A01 | Alta | Validación de sesión en servidor | ✅ |
| VUL-15 | IDOR en parámetro `id` | A01 | Alta | Validación de existencia del recurso | ✅ |
| VUL-16 | Lógica de negocio en carrito | A04 | Media | Filtros visible/eliminado/dueño | ✅ |
| VUL-17 | Fijación de sesión | A07 | Media | `session_regenerate_id(true)` | ✅ |
| VUL-18 | Sin límite de intentos de login | A07 | Media | Bloqueo temporal por IP/cuenta | ✅ |
| VUL-19 | Credenciales embebidas (root) | A05 | Media | Variables de entorno + usuario mínimo | ✅ |
| VUL-20 | Validación de entradas insuficiente | A03 | Media | Tipado de enteros / listas blancas | ✅ |
| VUL-21 | Errores expuestos en pantalla | A05 | Baja | `display_errors=Off` + handler | ✅ |
| VUL-22 | Faltan cabeceras y cookies seguras | A05 | Baja | CSP/HSTS/etc. + cookie segura | ✅ |

**Hallazgos de la revisión de la versión corregida** (segunda auditoría):

| ID | Vulnerabilidad | OWASP 2021 | Sev. | Corrección | Estado |
|----|----------------|-----------|------|------------|--------|
| VUL-23 | Credenciales de prueba publicadas y válidas en producción; secretos en log legible | A07 | Media-Alta | Claves aleatorias al desplegar, solo legibles por root; log 600 y sin trazas de secretos | ✅ |
| VUL-24 | Bloqueo de cuentas ajenas (DoS) y reinicio del contador con un login exitoso | A07 | Media | Límite por IP y por IP+cuenta; solo se limpian los fallos de esa cuenta | ✅ |
| VUL-25 | Componentes JS con CVE conocidos (jQuery 3.2.1, Bootstrap 4.1.3) | A06 | Baja | jQuery 3.7.1 y Bootstrap 4.6.2 | ✅ |
| VUL-26 | Comentarios sin límite (spam / inundación) | A04 | Baja | Máx. 5 por usuario cada 10 min; se muestran los 50 más recientes | ✅ |
| VUL-27 | Versión vulnerable expuesta indefinidamente en `:8080` | A05 | Baja | Se retira sola a las 2 horas (timer de systemd) | ✅ |

---

## 5. Despliegue en AWS (versión corregida)

Corresponde a la rama **`mejoras`**. El despliegue es automatizado:

```bash
pip install boto3
# credenciales de AWS en ~/.aws/credentials
python deploy/desplegar_aws.py --vulnerable --key vockey
```

- **URL pública:** https://54-197-67-4.sslip.io/index.php?id=1
- **Servicio / región:** EC2 (Ubuntu 24.04), `us-east-1`
- **Endurecimiento aplicado automáticamente:**
  - Security Group mínimo: 80/443 públicos; 22 y 8080 solo la IP del tester.
  - La versión original en `:8080` se elimina sola a las 2 horas (VUL027).
  - Claves de las cuentas de prueba aleatorias, en `/root/pnk-credenciales.txt` (VUL023).
  - Usuario de BD con privilegios mínimos y clave aleatoria (nada de `root`).
  - Credenciales como variables de entorno de Apache, fuera del webroot.
  - HTTPS obligatorio (Let's Encrypt), IMDSv2, disco EBS cifrado.
  - `display_errors=Off`, `expose_php=Off`, acceso denegado a `setup.php` y `.sql`.

Detalle del aprovisionamiento en [`deploy/user-data.sh`](deploy/user-data.sh).

---

## 6. Testing — Evidencia de que la vulnerabilidad ya no existe

El mismo ataque se repite contra la versión **original** (`:8080`) y la
**corregida** (HTTPS). Script reproducible en [`tests/test_seguridad.py`](tests/test_seguridad.py):

```bash
pip install requests
python tests/test_seguridad.py \
    --vulnerable http://54.197.67.4:8080 \
    --corregida  https://54-197-67-4.sslip.io
```

| Prueba | Original `:8080` | Corregida (HTTPS) |
|--------|------------------|-------------------|
| VUL-1 · Login SQLi `' OR '1'='1' -- -` | Sesión abierta sin credenciales | Bloqueado |
| VUL-2 · SQLi en `id` | Inyección aceptada (200) | HTTP 404 rechazado |
| VUL-10/14 · XSS + insertar sin login | `<script>` reflejado sin escapar | HTTP 403 + salida escapada |

Resultados completos y cabeceras verificadas en [`docs/evidencias/`](docs/evidencias/).

---

## 7. Autores

| Nombre | GitHub | Rol |
|--------|--------|-----|
| Matías Zepeda | [@matias725](https://github.com/matias725) | Owner |
| Joaquín Andrés Zambra Zúñiga | [@Joacooooooo](https://github.com/Joacooooooo) | Collaborator |
