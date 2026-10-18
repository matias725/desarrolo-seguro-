"""
Genera docs/informe_vulnerabilidades.docx con la estructura pedida:

  ID -> Vulnerabilidad
    - Vulnerabilidad / OWASP / Descripción / URL / Evidencia
    - Corrección: commit Git, código original, código nuevo
    - Evidencia sin vulnerabilidad
  + versión en AWS sin vulnerabilidades

Uso:  pip install python-docx  &&  python scripts/generar_informe.py
      python scripts/generar_informe.py --ip 3.80.1.2   # URLs reales de AWS
"""
import argparse
from pathlib import Path

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

REPO = "https://github.com/matias725/desarrolo-seguro-"
URL_ORIG = "http://<IP-AWS>:8080"          # rama main (vulnerable), solo IP del tester
URL_CORR = "https://<ip-aws>.sslip.io"     # rama mejoras (corregida)
FECHA = "17/10/2026"

C = {  # hash corto -> hash completo
    "94ef3a9": "94ef3a9ba004ceeb2bc9a99b854bc4519f000bc4",
    "f6070c8": "f6070c8b0d0249df91cc6b1386f4d295a96e4383",
    "294250b": "294250b311e78a98ea9958a300938736a58c15af",
    "e964933": "e9649336bb70067891335a68e8d0544586864c8f",
    "31c4312": "31c4312cf65aabec4179cb8904074fc4ec0b6eed",
    "3b4bca9": "3b4bca937c4497c69daa0be5f6c28098826367a4",
    "d57a953": "d57a9532f2e5a8b69f54300d08dd44ef2f89e07d",
    "273af11": "273af116fb440deff388302e828435df4cc5645d",
    "dd0c4f8": "dd0c4f8d3b9f81e5b8404b3e455272d3980127fc",
    "534932c": "534932ce44acac60b13bcda51c375da24fcbfb07",
    "e534271": "e534271ad4d3ff502ef211b2c9ec9878e6c2887b",
    "e71f454": "e71f4544392b12d1959c9d3fd668dfe7ea4c8996",
    "e3b4e54": "e3b4e54dcd09fe7cea5854048c9ff0aef3546bfa",
    "c617a06": "c617a06591cab91869b608783825c8cbb94f79fb",
    "62c29e9": "62c29e9925c07927b8647de92df3f5e38e476cda",
    "baf7250": "baf72507e2685878e602613375687aeca4c58f8f",
}

# Bloques de código reutilizados -------------------------------------------------
HELPER_CONSULTA = """// setup/setup.php (commit 94ef3a9): única vía de acceso a la BD
function consulta($sql, $tipos = '', ...$params)
{
    $stmt = conectar()->prepare($sql);
    if ($tipos !== '') {
        $stmt->bind_param($tipos, ...$params);
    }
    $stmt->execute();
    return $stmt->field_count > 0 ? $stmt->get_result() : $stmt;
}"""

VALIDA_ID = """$key = entero_positivo($_GET['id'] ?? null);   // solo ^[0-9]{1,9}$ y > 0
if ($key === false) {
    responder_error(404, 'Restaurante no encontrado.');
}"""

VULNS = [
    # ------------------------------------------------------------------ CRÍTICAS
    dict(
        id="VUL-001", nombre="SQL Injection en login (bypass de autenticación)",
        sev="Crítica", owasp="A03:2021 – Injection", asvs="V1 Encoding and Sanitization (prevención de inyección); V6 Authentication",
        iso="A.8.28, A.8.29, A.8.5", asc="ASC-07, ASC-10, ASC-14",
        desc="procesalogin.php concatena frmusuario y frmpassword dentro de la sentencia SQL. "
             "Con el payload ' OR '1'='1' -- - la condición WHERE siempre es verdadera y el sistema "
             "abre sesión sin conocer ninguna credencial; también permite extraer datos con UNION o "
             "técnicas booleanas/tiempo.",
        url="POST /setup/procesalogin.php  (campo frmusuario)",
        evid="Payload en frmusuario:  ' OR '1'='1' -- -     frmpassword: x\n"
             "Resultado en la versión original (main): SESIÓN ABIERTA sin credenciales\n"
             "(la barra superior muestra \"Bienvenido :Administrador\").",
        commits=["f6070c8", "94ef3a9"], archivo="src/pnkSecurity/setup/procesalogin.php",
        orig="""$sql="select * from usuarios where email='".$_POST['frmusuario']."'
      and password='".$_POST['frmpassword']."'";
$result=mysqli_query(conectar(),$sql);
$cont_login=mysqli_num_rows($result);
$datos=mysqli_fetch_array($result);
if($cont_login!=0) { session_start(); $_SESSION['nombre']=$datos['nombre']; }""",
        nuevo="""$usuario = consulta_fila(
    "SELECT Id, nombre, password, estado FROM usuarios WHERE email = ? LIMIT 1",
    's', $email
);
// Se verifica siempre un hash para no revelar qué correos existen.
$hash   = $usuario['password'] ?? '$2y$12$FpiqU2XFu81IFmQVzX5h4O...';
$valido = password_verify($password, $hash) && $usuario !== null
          && $usuario['estado'] === '1';""",
        despues="Mismo payload contra la versión corregida (mejoras): sin sesión (bloqueado).\n"
                "  [PASA] VUL-1  Login SQLi -> sin sesión (bloqueado)",
    ),
    dict(
        id="VUL-002", nombre="SQL Injection en index.php – datos del restaurante",
        sev="Crítica", owasp="A03:2021 – Injection", asvs="V1 Encoding and Sanitization; V2 Validation",
        iso="A.8.28, A.8.29", asc="ASC-10, ASC-14",
        desc="$_GET['id'] se asigna a $key sin validación y se concatena en la consulta que carga el "
             "restaurante. Cualquier visitante puede alterar la sentencia desde la URL.",
        url="GET /index.php?id=0 UNION SELECT 1-- -",
        evid="original  index.php?id=0 UNION SELECT 1-- -  -> HTTP 200 (inyección aceptada)",
        commits=["294250b"], archivo="src/pnkSecurity/index.php",
        orig="""$key=$_GET['id'];
$_SESSION['id']=$_GET['id'];
$sql_restorant="SELECT ... FROM restautantes INNER JOIN direcciones ...
  WHERE restautantes.id = ".$key." AND restautantes.eliminado IS NULL";
$result_restorant=mysqli_query(conectar(),$sql_restorant);""",
        nuevo=VALIDA_ID + """
$datos_restorant = consulta_fila(
    "SELECT ... FROM restautantes INNER JOIN direcciones ...
     WHERE restautantes.id = ? AND restautantes.eliminado IS NULL",
    'i', $key
);""",
        despues="corregida index.php?id=0 UNION SELECT 1-- -  -> HTTP 404 (rechazado)\n"
                "  [PASA] VUL-2  SQLi en id -> HTTP 404 (rechazado)",
    ),
    dict(
        id="VUL-003", nombre="SQL Injection en index.php – ítems destacados",
        sev="Crítica", owasp="A03:2021 – Injection", asvs="V1 Encoding and Sanitization",
        iso="A.8.28", asc="ASC-10, ASC-14",
        desc="La consulta de ítems destacados reutiliza $key (derivada de $_GET['id']) concatenada en el "
             "WHERE. Es un segundo punto de inyección independiente dentro del mismo archivo.",
        url="GET /index.php?id=<payload>",
        evid="Código vulnerable (revisión de código, informe inicial):\n"
             "... AND cartas.restautantes_id = \".$key.\" AND cartas.eliminada IS NULL ...\n"
             "Mismo vector que VUL-002: HTTP 200 con payload UNION en la versión original.",
        commits=["294250b"], archivo="src/pnkSecurity/index.php",
        orig="""$sql="SELECT items.id, ... FROM categorias INNER JOIN items ... INNER JOIN cartas ...
  WHERE items.destacado = 1 AND items.eliminado IS NULL AND items.visible=1
  AND cartas.restautantes_id = ".$key." AND cartas.eliminada IS NULL ...";
$result=mysqli_query(conectar(),$sql);""",
        nuevo="""// VUL003: consulta preparada.
$destacados_lista = consulta_todas(
    "SELECT items.id, items.tiempo, ... FROM categorias INNER JOIN items ...
     WHERE items.destacado = 1 AND items.eliminado IS NULL AND items.visible = 1
       AND cartas.restautantes_id = ? AND cartas.eliminada IS NULL ...",
    'i', $key
);""",
        despues="El id no numérico se rechaza antes de llegar a la consulta (HTTP 404) y la consulta "
                "usa parámetro enlazado 'i'. Prueba: index.php?id=0 UNION SELECT 1-- - -> HTTP 404.",
    ),
    dict(
        id="VUL-004", nombre="SQL Injection en index.php – listado de cartas y categorías",
        sev="Crítica", owasp="A03:2021 – Injection", asvs="V1 Encoding and Sanitization",
        iso="A.8.28", asc="ASC-10, ASC-14",
        desc="Las consultas de cartas y de categorías concatenan $key y el id de carta. "
             "Tercer punto de inyección dentro de index.php.",
        url="GET /index.php?id=<payload>",
        evid="Código vulnerable (revisión de código):\n"
             "$sqlcartas=\"... WHERE cartas.restautantes_id = \".$key.\" and visible=1 ...\";",
        commits=["294250b"], archivo="src/pnkSecurity/index.php",
        orig="""$sqlcartas="SELECT cartas.id, ... FROM cartas
  WHERE cartas.restautantes_id = ".$key." and visible=1 AND eliminada IS NULL
  order by orden asc";
$sql_categorias="select id,nombre from categorias where visible=1
  and cartas_id='".$arraycartas[$i]["id"]."' AND eliminado IS NULL ...";""",
        nuevo="""// VUL004: consulta preparada.
$arraycartas = consulta_todas(
    "SELECT cartas.id, cartas.nombre FROM cartas
     WHERE cartas.restautantes_id = ? AND visible = 1 AND eliminada IS NULL
     ORDER BY orden ASC",
    'i', $key
);
$lista_categorias = consulta_todas(
    "SELECT id, nombre FROM categorias WHERE visible = 1 AND cartas_id = ? ...",
    'i', $carta['id']
);""",
        despues="index.php?id=0 UNION SELECT 1-- - -> HTTP 404. Todas las consultas del archivo "
                "usan marcadores ? (grep de mysqli_query en la rama mejoras: 0 resultados).",
    ),
    dict(
        id="VUL-005", nombre="SQL Injection en index.php – comentarios",
        sev="Crítica", owasp="A03:2021 – Injection", asvs="V1 Encoding and Sanitization",
        iso="A.8.28", asc="ASC-10, ASC-14",
        desc="La consulta que recupera los comentarios del restaurante concatena $key directamente.",
        url="GET /index.php?id=<payload>",
        evid="$sqlcomentarios=\"select * from comentarios where id_restaurante=\".$key;",
        commits=["294250b", "dd0c4f8"], archivo="src/pnkSecurity/index.php",
        orig="""$sqlcomentarios="select * from comentarios where id_restaurante=".$key;
$resultcomentarios=mysqli_query(conectar(),$sqlcomentarios);""",
        nuevo="""// VUL005: consulta preparada. VUL026: solo los 50 más recientes.
$lista_comentarios = array_reverse(consulta_todas(
    "SELECT usuario, comentario FROM comentarios
     WHERE id_restaurante = ? ORDER BY Id DESC LIMIT 50",
    'i', $key
));""",
        despues="index.php?id=0 UNION SELECT 1-- - -> HTTP 404 (rechazado).",
    ),
    dict(
        id="VUL-006", nombre="SQL Injection en mostrar_carrito.php",
        sev="Crítica", owasp="A03:2021 – Injection", asvs="V1 Encoding and Sanitization; V2 Validation",
        iso="A.8.28", asc="ASC-10, ASC-14",
        desc="La vista del carrito repite el patrón: $_GET['id'] concatenado sin validar en la consulta "
             "del restaurante (y además sin filtrar restaurantes eliminados).",
        url="GET /mostrar_carrito.php?id=1 OR 1=1",
        evid="original  mostrar_carrito.php?id=1 OR 1=1 -> HTTP 200 (inyección aceptada)",
        commits=["294250b"], archivo="src/pnkSecurity/mostrar_carrito.php",
        orig="""$key=$_GET['id'];
$sql_restorant="SELECT ... FROM restautantes INNER JOIN direcciones ...
  WHERE restautantes.id = ".$key;
$result_restorant=mysqli_query(conectar(),$sql_restorant);""",
        nuevo="""$key = entero_positivo($_GET['keyid'] ?? null);
if ($key === false) {
    responder_error(404, 'Restaurante no encontrado.');
}
$datos_restorant = consulta_fila(
    "SELECT restautantes.nombre, restautantes.id, restautantes.foto
     FROM restautantes INNER JOIN direcciones ...
     WHERE restautantes.id = ? AND restautantes.eliminado IS NULL",
    'i', $key
);""",
        despues="corregida mostrar_carrito.php?keyid=1 OR 1=1 -> HTTP 404   |   ?keyid=1 -> HTTP 200",
    ),
    dict(
        id="VUL-007", nombre="SQL Injection en carrito.php (AJAX)",
        sev="Crítica", owasp="A03:2021 – Injection", asvs="V1 Encoding and Sanitization; V4 API and Web Service",
        iso="A.8.28", asc="ASC-10, ASC-14, ASC-29",
        desc="El parámetro POST iditems, enviado por controladorajax.js, se concatena en la consulta "
             "que agrega un producto al carrito.",
        url="POST /carrito.php   op=1&iditems=0 UNION SELECT ...",
        evid="$sql=\"select id, nombre, precio from items where id=\".$_POST['iditems'];\n"
             "En la versión original el payload UNION agrega al carrito una fila con datos arbitrarios.",
        commits=["31c4312"], archivo="src/pnkSecurity/carrito.php",
        orig="""function insertar()
{
    $sql="select id, nombre, precio from items where id=".$_POST['iditems'];
    $result=mysqli_query(conectar(),$sql);
    $datos=mysqli_fetch_array($result);
    ...
}""",
        nuevo="""$iditem = entero_positivo($_POST['iditems'] ?? null);
if ($iditem === false || $restaurante === false) {
    responder_json(400, ['ok' => false, 'error' => 'Producto no válido.']);
}
$datos = consulta_fila(
    "SELECT items.id, items.nombre, items.precio FROM items ...
     WHERE items.id = ? AND items.visible = 1 AND items.eliminado IS NULL ...
       AND cartas.restautantes_id = ?",
    'ii', $iditem, $restaurante
);""",
        despues="corregida op=1 iditems=0 UNION SELECT... (con token CSRF) -> HTTP 400",
    ),
    dict(
        id="VUL-008", nombre="SQL Injection en grcomentarios.php (INSERT)",
        sev="Crítica", owasp="A03:2021 – Injection", asvs="V1 Encoding and Sanitization",
        iso="A.8.28", asc="ASC-10, ASC-14",
        desc="usuario y comentario se concatenan en un INSERT. Permite inyección SQL y suplantar el "
             "nombre del autor del comentario.",
        url="POST /grcomentarios.php   usuario=...&comentario=...",
        evid="$sql=\"INSERT INTO comentarios SET usuario='\".$_POST['usuario'].\"',\n"
             "      comentario='\".$_POST['comentario'].\"',id_restaurante=\".$_SESSION['id'];\n"
             "Un apóstrofe en el comentario rompe la sentencia (error SQL en la versión original).",
        commits=["e964933"], archivo="src/pnkSecurity/grcomentarios.php",
        orig="""$sql="INSERT INTO comentarios SET usuario='".$_POST['usuario']."',
      comentario='".$_POST['comentario']."',id_restaurante=".$_SESSION['id'];
mysqli_query(conectar(),$sql);""",
        nuevo="""consulta(
    "INSERT INTO comentarios (usuario, usuario_id, comentario, id_restaurante)
     VALUES (?, ?, ?, ?)",
    'sisi', $_SESSION['nombre'], $_SESSION['usuario_id'], $comentario, $restaurante
);  // el autor sale de la sesión, no del formulario""",
        despues="El comentario con <script> y apóstrofes se guarda literalmente (sin error SQL) y se "
                "muestra escapado:  &lt;script&gt;alert(1)&lt;/script&gt;",
    ),
    dict(
        id="VUL-009", nombre="Contraseñas almacenadas en texto plano",
        sev="Crítica", owasp="A02:2021 – Cryptographic Failures", asvs="V6 Authentication; V11 Cryptography",
        iso="A.5.17, A.8.5, A.8.24", asc="ASC-07, ASC-12",
        desc="La tabla usuarios guarda la contraseña tal cual y el login la compara en SQL. Cualquier "
             "fuga de la BD (por ejemplo vía VUL-001..008) expone todas las credenciales.",
        url="Tabla usuarios (src/Script_BD/pnk_security.sql) + POST /setup/procesalogin.php",
        evid="original (texto plano):\n  admin@gmail.com   -> admin01\n  alondra@gmail.com -> alondra01",
        commits=["f6070c8"], archivo="src/Script_BD/pnk_security.sql, migracion_seguridad.sql, procesalogin.php",
        orig="""INSERT INTO `usuarios` VALUES
 (1,'Administrador','admin@gmail.com','admin01','1'),
 (2,'Alondra','alondra@gmail.com','alondra01','1');
-- login:  ... where email='...' and password='".$_POST['frmpassword']."'""",
        nuevo="""-- migracion_seguridad.sql: hash bcrypt (password_hash, cost 12)
UPDATE `usuarios` SET `password` = '$2y$12$M46C...' WHERE `email` = 'admin@gmail.com';
ALTER TABLE `usuarios` ADD UNIQUE KEY `uq_usuarios_email` (`email`);
// procesalogin.php
$valido = password_verify($password, $hash) && ...;""",
        despues="corregida (hash bcrypt):\n  admin@gmail.com   -> $2y$12$ODh076...  (60 chars)\n"
                "  alondra@gmail.com -> $2y$12$mk.wpA...  (60 chars)",
    ),
    # ------------------------------------------------------------------ ALTAS
    dict(
        id="VUL-010", nombre="Cross-Site Scripting (XSS) almacenado en comentarios",
        sev="Alta", owasp="A03:2021 – Injection (XSS)", asvs="V1 Encoding and Sanitization (codificación de salida); V3 Web Frontend Security",
        iso="A.8.28", asc="ASC-10",
        desc="usuario y comentario se imprimen en el HTML sin htmlspecialchars(). Un script publicado "
             "como comentario se ejecuta en el navegador de cada visitante (robo de cookie, defacement).",
        url="POST /grcomentarios.php  ->  GET /index.php?id=1 (sección Comentarios)",
        evid="Payload: <script>alert(document.cookie)</script>\n"
             "original -> HTTP 200, SCRIPT SIN ESCAPAR (XSS) en index.php?id=1",
        commits=["294250b", "94ef3a9"], archivo="src/pnkSecurity/index.php, setup/setup.php",
        orig="""<b><?php echo $datoscomentarios['usuario'];?></b>
<br>
<?php echo $datoscomentarios['comentario'];?>""",
        nuevo="""function e($texto) {   // setup.php
    return htmlspecialchars((string) $texto, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
<b><?php echo e($datoscomentarios['usuario']);?></b>
<br>
<?php echo nl2br(e($datoscomentarios['comentario']));?>
// + CSP: script-src 'self' (VUL-022) como segunda barrera""",
        despues="corregida: con sesión, <script> se guarda pero en el HTML aparece:\n"
                "  &lt;script&gt;alert(1)&lt;/script&gt;\n"
                "  [PASA] VUL-10 XSS -> script no reflejado",
    ),
    dict(
        id="VUL-011", nombre="Ausencia de token CSRF en el login",
        sev="Alta", owasp="A01:2021 – Broken Access Control (CSRF)", asvs="V3 Web Frontend Security (protección CSRF)",
        iso="A.8.28", asc="ASC-09, ASC-10",
        desc="El formulario de login no lleva token anti-CSRF ni valida el origen: un sitio externo "
             "puede forzar inicios de sesión (login CSRF) y combinarlo con VUL-001.",
        url="POST /setup/procesalogin.php (formulario en index.php)",
        evid="<form class=\"form-inline\" action=\"setup/procesalogin.php\" method=\"post\">\n"
             "  ...  // sin campo csrf_token",
        commits=["f6070c8", "294250b", "94ef3a9"], archivo="index.php, setup/procesalogin.php, setup/setup.php",
        orig="""<form class="form-inline" role="search" action="setup/procesalogin.php" method="post">
  <input type="text" name="frmusuario" placeholder="Usuario">
  <input type="password" name="frmpassword" placeholder="Contraseña">
</form>""",
        nuevo="""<input type="hidden" name="csrf_token" value="<?php echo e($csrf);?>">
// procesalogin.php
exigir_post();
validar_csrf();   // hash_equals($_SESSION['csrf_token'], $enviado) o 403""",
        despues="corregida: POST sin token -> HTTP 403   |   GET -> HTTP 405",
    ),
    dict(
        id="VUL-012", nombre="Ausencia de token CSRF en comentarios",
        sev="Alta", owasp="A01:2021 – Broken Access Control (CSRF)", asvs="V3 Web Frontend Security (protección CSRF)",
        iso="A.8.28", asc="ASC-09, ASC-10",
        desc="Un sitio externo puede hacer que un usuario autenticado publique comentarios (incluido el "
             "payload XSS de VUL-010) sin su consentimiento.",
        url="POST /grcomentarios.php",
        evid="<form action=\"grcomentarios.php\" method=\"post\"> ... </form>  // sin csrf_token",
        commits=["e964933", "294250b"], archivo="src/pnkSecurity/grcomentarios.php",
        orig="""include("setup/setup.php");
session_start();
$sql="INSERT INTO comentarios SET ...";   // sin verificar token""",
        nuevo="""iniciar_sesion();
exigir_post();
if (!usuario_autenticado()) { responder_error(403, 'Debe iniciar sesión para comentar.'); }
validar_csrf();""",
        despues="corregida (con sesión): POST sin token -> HTTP 403",
    ),
    dict(
        id="VUL-014", nombre="Autorización solo en el cliente (comentarios sin sesión)",
        sev="Alta", owasp="A01:2021 – Broken Access Control", asvs="V8 Authorization",
        iso="A.5.15, A.8.3", asc="ASC-08",
        desc="El formulario de comentarios solo se oculta en la interfaz al usuario anónimo, pero el "
             "endpoint acepta el POST de cualquiera.",
        url="POST /grcomentarios.php (sin cookie de sesión)",
        evid="original -> HTTP 200, comentario insertado sin iniciar sesión",
        commits=["e964933"], archivo="src/pnkSecurity/grcomentarios.php",
        orig="""include("setup/setup.php");
session_start();
// no existe if(isset($_SESSION['nombre']))
$sql="INSERT INTO comentarios SET usuario='".$_POST['usuario']."', ...";""",
        nuevo="""if (!usuario_autenticado()) {
    responder_error(403, 'Debe iniciar sesión para comentar.');
}""",
        despues="corregida: POST a grcomentarios SIN sesión -> HTTP 403 (requiere login)\n"
                "  [PASA] VUL-14 auth -> HTTP 403",
    ),
    dict(
        id="VUL-015", nombre="IDOR en el parámetro id (restaurante)",
        sev="Alta", owasp="A01:2021 – Broken Access Control (IDOR)", asvs="V8 Authorization (autorización a nivel de objeto)",
        iso="A.5.15, A.8.3", asc="ASC-08",
        desc="El id de restaurante recibido por GET se guarda directo en $_SESSION['id'] y se usa en "
             "todas las consultas siguientes sin validar que exista ni que esté activo. Permite "
             "enumerar recursos y dejar la sesión apuntando a restaurantes eliminados.",
        url="GET /index.php?id=999   (y mostrar_carrito.php)",
        evid="original  ?id=999 -> HTTP 200 (página vacía, la sesión queda con id=999)",
        commits=["294250b"], archivo="src/pnkSecurity/index.php, mostrar_carrito.php",
        orig="""$key=$_GET['id'];
$_SESSION['id']=$_GET['id'];   // sin validar existencia ni estado""",
        nuevo=VALIDA_ID + """
$datos_restorant = consulta_fila("... WHERE restautantes.id = ? AND eliminado IS NULL", 'i', $key);
if ($datos_restorant === null) {
    responder_error(404, 'Restaurante no encontrado.');
}
$_SESSION['id'] = $key;   // solo después de comprobar el recurso""",
        despues="corregida ?id=999 -> HTTP 404",
    ),
    # ------------------------------------------------------------------ MEDIAS
    dict(
        id="VUL-013", nombre="Ausencia de token CSRF en el carrito (AJAX)",
        sev="Media", owasp="A01:2021 – Broken Access Control (CSRF)", asvs="V3 Web Frontend Security; V4 API and Web Service",
        iso="A.8.28", asc="ASC-09, ASC-29",
        desc="Las llamadas AJAX que agregan, quitan o vacían el carrito no llevan token ni validan el "
             "origen; además vaciar el carrito destruía la sesión completa.",
        url="POST /carrito.php  op=1|2|3",
        evid="$.ajax({ type: \"POST\", url: 'carrito.php', data: \"op=1&iditems=\"+id, ... });\n"
             "// sin token CSRF",
        commits=["31c4312"], archivo="src/pnkSecurity/carrito.php, js/controladorajax.js",
        orig="""$.ajax({ type: "POST", url: 'carrito.php', data: "op=1&iditems="+id, ... });
// carrito.php
switch($_POST['op']) { ... case "3": eliminartodo(); }   // session_destroy()""",
        nuevo="""// controladorajax.js
headers: { 'X-CSRF-Token': $('meta[name="csrf-token"]').attr('content') }
// carrito.php
exigir_post();
validar_csrf();
switch ($_POST['op'] ?? '') { ... default: responder_json(400, ...); }""",
        despues="corregida: op=1 SIN token CSRF -> HTTP 403",
    ),
    dict(
        id="VUL-016", nombre="Lógica de negocio: agregar ítems ocultos/eliminados al carrito",
        sev="Media", owasp="A04:2021 – Insecure Design", asvs="V2 Validation and Business Logic",
        iso="A.8.26, A.8.28", asc="ASC-02, ASC-14",
        desc="La consulta del carrito no filtra items.visible ni items.eliminado ni el restaurante "
             "actual: iterando ids se agregan productos ocultos, eliminados o de otro local.",
        url="POST /carrito.php  op=1&iditems=3 (ítem eliminado)",
        evid="original: op=1&iditems=3 -> el ítem eliminado se agrega al carrito",
        commits=["31c4312"], archivo="src/pnkSecurity/carrito.php",
        orig="""$sql="select id, nombre, precio from items where id=".$_POST['iditems'];
// falta visible=1, eliminado IS NULL y restaurante actual""",
        nuevo="""WHERE items.id = ? AND items.visible = 1 AND items.eliminado IS NULL
  AND categorias.visible = 1 AND categorias.eliminado IS NULL
  AND cartas.visible = 1 AND cartas.eliminada IS NULL
  AND cartas.restautantes_id = ?
// + máximo 50 ítems por carrito""",
        despues="corregida: op=1 iditems=3 (item eliminado) -> HTTP 404\n"
                "           op=1 iditems=5 (item visible)   -> HTTP 200",
    ),
    dict(
        id="VUL-017", nombre="Fijación de sesión (session fixation)",
        sev="Media", owasp="A07:2021 – Identification and Authentication Failures", asvs="V7 Session Management",
        iso="A.8.5", asc="ASC-09",
        desc="Tras autenticar no se regenera el identificador de sesión: un atacante que fije el "
             "PHPSESSID de la víctima hereda su sesión autenticada.",
        url="POST /setup/procesalogin.php",
        evid="session_start();\n$_SESSION['nombre']=$datos['nombre'];\n"
             "// el PHPSESSID es el mismo antes y después del login",
        commits=["f6070c8", "94ef3a9"], archivo="src/pnkSecurity/setup/procesalogin.php",
        orig="""session_start();
$_SESSION['nombre']=$datos['nombre'];""",
        nuevo="""session_regenerate_id(true);
$_SESSION['usuario_id'] = (int) $usuario['Id'];
$_SESSION['nombre']     = $usuario['nombre'];
$_SESSION['csrf_token'] = bin2hex(random_bytes(32));
// + session.use_strict_mode=1 y expiración por inactividad (30 min)""",
        despues="corregida:\n  ID antes:   52b73045b8ce0cbe30d55a8d37de6e1c\n"
                "  ID después: 60a2f11b1f0dafd1015f64cf5d0dd188  -> el ID cambia",
    ),
    dict(
        id="VUL-018", nombre="Sin límite de intentos de login (fuerza bruta)",
        sev="Media", owasp="A07:2021 – Identification and Authentication Failures", asvs="V6 Authentication (anti-automatización)",
        iso="A.8.5", asc="ASC-07",
        desc="No hay bloqueo, retardo ni contador de intentos fallidos: se pueden probar diccionarios "
             "de contraseñas sin restricción.",
        url="POST /setup/procesalogin.php (repetido)",
        evid="original: intentos ilimitados; ninguna respuesta cambia tras N fallos.",
        commits=["f6070c8", "d57a953"], archivo="src/pnkSecurity/setup/procesalogin.php",
        orig="""// ningún contador de intentos, CAPTCHA ni retardo
$result=mysqli_query(conectar(),$sql);""",
        nuevo="""const MAX_INTENTOS_CUENTA = 5;   // por IP + correo
const MAX_INTENTOS_IP     = 10;  // por IP
const VENTANA_MINUTOS     = 15;
$intentos = consulta_fila("SELECT COUNT(*) AS por_ip, COALESCE(SUM(email = ?), 0) AS por_cuenta
   FROM login_intentos WHERE ip = ? AND creado > (NOW() - INTERVAL 15 MINUTE)", 'ss', $email, $ip);
if (por_ip >= 10 || por_cuenta >= 5) -> 'Demasiados intentos fallidos...'""",
        despues="corregida: tras 5 fallos, 6º intento con clave CORRECTA ->\n"
                "  \"Demasiados intentos fallidos. Intente nuevamente en 15 minutos.\"",
    ),
    dict(
        id="VUL-019", nombre="Credenciales de BD embebidas en el código (root sin clave)",
        sev="Media", owasp="A05:2021 – Security Misconfiguration", asvs="V13 Configuration (gestión de secretos)",
        iso="A.5.17, A.8.9, A.8.24", asc="ASC-13",
        desc="setup.php conecta como root sin contraseña, versionado en Git. Cualquier fallo de la app "
             "opera con privilegios totales sobre MySQL.",
        url="src/pnkSecurity/setup/setup.php (y GET /setup/setup.php)",
        evid="function conectar(){\n    $con=mysqli_connect(\"localhost\",\"root\",\"\",\"pnk_security\");\n}",
        commits=["94ef3a9", "3b4bca9"], archivo="src/pnkSecurity/setup/setup.php, deploy/user-data.sh",
        orig="""function conectar()
{
    $con=mysqli_connect("localhost","root","","pnk_security");
    return $con;
}""",
        nuevo="""$con = new mysqli(
    config('PNK_DB_HOST') ?? 'localhost',
    config('PNK_DB_USER'),          // getenv() / config.local.php (fuera de Git)
    config('PNK_DB_PASS'),
    config('PNK_DB_NAME') ?? 'pnk_security'
);
-- AWS: usuario pnk_app con SELECT + INSERT mínimos, clave aleatoria
--      en /etc/apache2/pnk-secretos.conf (chmod 600, SetEnv)""",
        despues="AWS: GET /setup/setup.php -> HTTP 403; la app conecta con pnk_app (no root);\n"
                "el archivo .sql no es accesible desde la web.",
    ),
    dict(
        id="VUL-020", nombre="Validación de entradas insuficiente (causa raíz transversal)",
        sev="Media", owasp="A03:2021 – Injection", asvs="V2 Validation and Business Logic",
        iso="A.8.28", asc="ASC-10",
        desc="Ningún parámetro (id, iditems, pos, op) se valida en tipo o formato antes de usarse. Es la "
             "causa raíz que habilita VUL-001..008.",
        url="Todos los endpoints: index.php, mostrar_carrito.php, carrito.php, grcomentarios.php",
        evid="$key=$_GET['id'];  // sin conversión ni validación",
        commits=["94ef3a9", "294250b", "31c4312"], archivo="setup/setup.php + endpoints",
        orig="""$key=$_GET['id'];
switch($_POST['op']) { ... }        // sin default
unset($_SESSION["carrito"][$_POST['pos']]);""",
        nuevo="""function entero_positivo($valor) {
    if (!is_string($valor) || !preg_match('/^[0-9]{1,9}$/', $valor)) return false;
    $n = (int) $valor;
    return $n > 0 ? $n : false;
}
switch ($_POST['op'] ?? '') { ... default: responder_json(400, ...); }""",
        despues="corregida: op=9 (operación inválida) -> HTTP 400; id no numérico -> HTTP 404",
    ),
    # ------------------------------------------------------------------ BAJAS
    dict(
        id="VUL-021", nombre="Errores técnicos expuestos en pantalla",
        sev="Baja", owasp="A05:2021 – Security Misconfiguration", asvs="V16 Security Logging and Error Handling",
        iso="A.8.15, A.8.28", asc="ASC-27, ASC-28",
        desc="Ningún mysqli_query() valida su resultado; con display_errors activo un payload "
             "malformado muestra rutas absolutas y código.",
        url="GET /index.php?id=1'",
        evid="original  ?id=1' -> Fatal error (ruta y línea del archivo visibles)",
        commits=["94ef3a9"], archivo="src/pnkSecurity/setup/setup.php",
        orig="""$result=mysqli_query(conectar(),$sql);
$datos=mysqli_fetch_array($result);   // sin verificar $result === false""",
        nuevo="""ini_set('display_errors', '0');
ini_set('log_errors', '1');
set_exception_handler(function ($ex) {
    error_log('[pnkSecurity] ' . get_class($ex) . ': ' . $ex->getMessage() ...);
    responder_error(500, 'Ocurrió un error inesperado. Intente nuevamente más tarde.');
});""",
        despues="corregida ?id=1' -> HTTP 404 (sin traza técnica)",
    ),
    dict(
        id="VUL-022", nombre="Faltan cabeceras de seguridad y atributos de cookie",
        sev="Baja", owasp="A05:2021 – Security Misconfiguration", asvs="V3 Web Frontend Security; V7 Session Management; V12 Secure Communication",
        iso="A.8.9, A.8.27", asc="ASC-06, ASC-09",
        desc="Sin CSP, X-Frame-Options, nosniff ni HSTS; la cookie PHPSESSID no tiene HttpOnly, Secure "
             "ni SameSite.",
        url="Todas las respuestas HTTP",
        evid="original: sin cabeceras de seguridad; cookie PHPSESSID sin HttpOnly/SameSite/Secure",
        commits=["94ef3a9"], archivo="src/pnkSecurity/setup/setup.php",
        orig="""session_start();   // configuración por defecto de PHP, sin header() de seguridad""",
        nuevo="""header("Content-Security-Policy: default-src 'self'; script-src 'self'; ...");
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Strict-Transport-Security: max-age=31536000; includeSubDomains');  // HTTPS
session_set_cookie_params(['secure' => es_https(), 'httponly' => true,
                           'samesite' => 'Strict', 'path' => '/']);""",
        despues="Content-Security-Policy: default-src 'self'; script-src 'self'; ...\n"
                "X-Content-Type-Options: nosniff\nX-Frame-Options: DENY\n"
                "Strict-Transport-Security: max-age=31536000; includeSubDomains\n"
                "Set-Cookie: PNKSESSID=...; path=/; secure; HttpOnly; SameSite=Strict",
    ),
    # ------------------------------------------------------------------ SEGUNDA AUDITORÍA
    dict(
        id="VUL-023", nombre="Credenciales de prueba conocidas en producción y secretos en log",
        sev="Media-Alta", owasp="A07:2021 – Identification and Authentication Failures", asvs="V6 Authentication; V13 Configuration",
        iso="A.5.17, A.8.31, A.8.33", asc="ASC-13, ASC-24",
        desc="Segunda auditoría: el despliegue usaba las mismas claves de laboratorio (publicadas en el "
             "README) y el log de aprovisionamiento registraba secretos con set -x.",
        url="Login en " + URL_CORR + " con las claves del README; /var/log/pnk-deploy.log",
        evid="README (main) publicaba las claves de admin@gmail.com y alondra@gmail.com, y user-data.sh "
             "dejaba DB_PASS visible en /var/log/pnk-deploy.log (legible por otros usuarios).",
        commits=["534932c"], archivo="deploy/user-data.sh (+ commit 146508c en main: retira claves del README)",
        orig="""exec > /var/log/pnk-deploy.log 2>&1      # con set -x: secretos al log
DB_PASS=$(openssl rand -hex 24)
mysql pnk_security < migracion_seguridad.sql  # hashes de claves conocidas""",
        nuevo="""install -m 600 /dev/null /var/log/pnk-deploy.log
set +x   # no escribir secretos en el log
for EMAIL in admin@gmail.com alondra@gmail.com; do
    CLAVE=$(openssl rand -base64 18 | tr -d '/+=')
    HASH=$(CLAVE="$CLAVE" php -r 'echo password_hash(getenv("CLAVE"), PASSWORD_BCRYPT, ["cost"=>12]);')
    mysql pnk_security -e "UPDATE usuarios SET password='${HASH}' WHERE email='${EMAIL}'"
    echo "${EMAIL}  ${CLAVE}" >> /root/pnk-credenciales.txt   # chmod 600
done""",
        despues="Evidencia de configuración (código de despliegue). Verificación en instancia: "
                "login con admin01 falla; ls -l /var/log/pnk-deploy.log -> -rw------- root.",
        estado="Corregido – verificado en AWS (17/10/2026)",
    ),
    dict(
        id="VUL-024", nombre="Bloqueo de cuentas ajenas (DoS) en el límite de intentos",
        sev="Media", owasp="A07:2021 – Identification and Authentication Failures", asvs="V6 Authentication (anti-automatización)",
        iso="A.8.5", asc="ASC-07",
        desc="La primera versión del bloqueo (VUL-018) contaba fallos por IP O por correo: un atacante "
             "podía bloquear a otra persona fallando con su correo, y un login exitoso reiniciaba el "
             "contador de la IP.",
        url="POST /setup/procesalogin.php",
        evid="WHERE (ip = ? OR email = ?) ...   -> 5 fallos con el correo de la víctima la bloquean\n"
             "DELETE FROM login_intentos WHERE ip = ? OR email = ?  -> reinicia el contador",
        commits=["d57a953"], archivo="src/pnkSecurity/setup/procesalogin.php",
        orig="""$intentos = consulta_fila("SELECT COUNT(*) AS total FROM login_intentos
   WHERE (ip = ? OR email = ?) AND creado > ...", 'ss', $ip, $email);
consulta("DELETE FROM login_intentos WHERE ip = ? OR email = ?", 'ss', $ip, $email);""",
        nuevo="""$intentos = consulta_fila("SELECT COUNT(*) AS por_ip, COALESCE(SUM(email = ?), 0) AS por_cuenta
   FROM login_intentos WHERE ip = ? AND creado > ...", 'ss', $email, $ip);
// solo se limpian los fallos de esta cuenta desde esta IP
consulta("DELETE FROM login_intentos WHERE ip = ? AND email = ?", 'ss', $ip, $email);""",
        despues="corregida: el bloqueo se aplica a la IP atacante (5 por IP+cuenta, 10 por IP); "
                "la cuenta de la víctima sigue accesible desde otra IP.",
    ),
    dict(
        id="VUL-025", nombre="Componentes JavaScript con vulnerabilidades conocidas",
        sev="Baja", owasp="A06:2021 – Vulnerable and Outdated Components", asvs="V15 Secure Coding and Architecture (dependencias)",
        iso="A.8.8, A.5.21", asc="ASC-15",
        desc="jQuery 3.2.1 (CVE-2019-11358, CVE-2020-11022/11023) y Bootstrap 4.1.3 (CVE-2019-8331).",
        url="GET /vendors/jquery/jquery-3.2.1.min.js",
        evid="original: /*! jQuery v3.2.1 | (c) JS Foundation  + Bootstrap 4.1.3",
        commits=["273af11"], archivo="src/pnkSecurity/vendors/, index.php, mostrar_carrito.php",
        orig="""<script src="vendors/jquery/jquery-3.2.1.min.js"></script>
<!-- Bootstrap v4.1.3 -->""",
        nuevo="""<script src="vendors/jquery/jquery-3.7.1.min.js"></script>
<!-- Bootstrap v4.6.2 -->""",
        despues="corregida: jQuery v3.7.1 + Bootstrap v4.6.2;\n"
                "GET /vendors/jquery/jquery-3.2.1.min.js -> HTTP 404 (ya no existe)",
    ),
    dict(
        id="VUL-026", nombre="Comentarios sin límite (spam / inundación)",
        sev="Baja", owasp="A04:2021 – Insecure Design", asvs="V2 Validation and Business Logic (anti-automatización)",
        iso="A.8.26", asc="ASC-02",
        desc="Un usuario autenticado podía publicar comentarios ilimitados y la página cargaba todos.",
        url="POST /grcomentarios.php (repetido)",
        evid="original: sin límite; SELECT * FROM comentarios sin LIMIT",
        commits=["dd0c4f8"], archivo="src/pnkSecurity/grcomentarios.php, index.php, migracion_seguridad_2.sql",
        orig="""consulta("INSERT INTO comentarios (usuario, comentario, id_restaurante) VALUES (?, ?, ?)", ...);
"SELECT usuario, comentario FROM comentarios WHERE id_restaurante = ? ORDER BY Id ASC" """,
        nuevo="""const MAX_COMENTARIOS = 5;
const VENTANA_COMENTARIOS_MIN = 10;
$recientes = consulta_fila("SELECT COUNT(*) AS total FROM comentarios
   WHERE usuario_id = ? AND creado > (NOW() - INTERVAL 10 MINUTE)", 'i', $_SESSION['usuario_id']);
if ((int) $recientes['total'] >= MAX_COMENTARIOS) { ... 'Ha publicado demasiados comentarios.' }
... ORDER BY Id DESC LIMIT 50""",
        despues="corregida: se publican 6 comentarios -> 6º: \"Ha publicado demasiados comentarios...\"\n"
                "Comentarios realmente guardados: 5 (máximo 5 por 10 min)",
    ),
    dict(
        id="VUL-027", nombre="Versión vulnerable expuesta indefinidamente en :8080",
        sev="Baja", owasp="A05:2021 – Security Misconfiguration", asvs="V13 Configuration",
        iso="A.8.9, A.8.31", asc="ASC-23, ASC-26",
        desc="Para la evidencia comparativa se publica la rama main en :8080 (solo IP del tester). "
             "Si nadie la apagaba, quedaba expuesta de forma permanente.",
        url=URL_ORIG + "/index.php?id=1",
        evid="deploy/user-data.sh (3b4bca9) creaba el VirtualHost :8080 sin fecha de retiro.",
        commits=["534932c", "c617a06"], archivo="deploy/user-data.sh, deploy/desplegar_y_evidenciar.ps1",
        orig="""a2ensite pnk-original     # queda publicado hasta que alguien lo apague""",
        nuevo="""# user-data.sh: la versión vulnerable se elimina sola a las 2 horas
pnk-retirar-original.timer  ->  OnBootSec=2h
    a2dissite pnk-original; rm -rf /var/www/original; DROP DATABASE pnk_original
# desplegar_y_evidenciar.ps1: apenas termina el testing se cierra 8080
ec2.revoke_security_group_ingress(GroupId=sg, IpPermissions=[regla 8080])""",
        despues="desplegar_y_evidenciar.ps1 registra en resultado_testing.txt:\n"
                "  Version original :8080 tras el testing -> cerrado (sin respuesta)",
        estado="Corregido – verificado en AWS (17/10/2026)",
    ),
    # ------------------------------------------------------------------ TERCERA REVISIÓN
    dict(
        id="VUL-028", nombre="Detección de HTTPS confiando en X-Forwarded-Proto del cliente",
        sev="Baja", owasp="A05:2021 – Security Misconfiguration", asvs="V12 Secure Communication; V7 Session Management",
        iso="A.8.9, A.8.27", asc="ASC-06, ASC-09",
        desc="Tercera revisión: es_https() aceptaba la cabecera X-Forwarded-Proto enviada por cualquier "
             "cliente. Sin balanceador, un atacante podía hacer que el servidor creyera estar en HTTPS "
             "(cookie marcada Secure y HSTS emitidos sobre HTTP), ocultando una conexión no cifrada.",
        url="Cualquier página: cabecera  X-Forwarded-Proto: https  sobre http://",
        evid="curl -H 'X-Forwarded-Proto: https' http://<host>/index.php?id=1\n"
             "-> Strict-Transport-Security y cookie 'secure' en una respuesta HTTP plana",
        commits=["e534271"], archivo="src/pnkSecurity/setup/setup.php",
        orig="""function es_https()
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
}""",
        nuevo="""function es_https()
{
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
        return true;
    }
    // solo detrás de un balanceador configurado explícitamente
    return config('PNK_TRUST_PROXY') === '1'
        && ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
}""",
        despues="La cabecera enviada por el cliente se ignora (PNK_TRUST_PROXY no está definido en AWS: "
                "Apache termina TLS directamente).",
        estado="Corregido – verificar con test_seguridad.py",
    ),
    dict(
        id="VUL-029", nombre="CSP con 'unsafe-inline' y fuentes externas",
        sev="Baja", owasp="A05:2021 – Security Misconfiguration", asvs="V3 Web Frontend Security",
        iso="A.8.9, A.8.28", asc="ASC-06, ASC-10",
        desc="La CSP permitía style-src 'unsafe-inline', lo que habilita inyección de CSS (exfiltración "
             "de datos con selectores) si aparece cualquier otra falla de salida. style.css importaba "
             "Google Fonts (dependencia externa no declarada). Faltaban COOP/CORP.",
        url="Todas las respuestas HTML",
        evid="Content-Security-Policy: ... style-src 'self' 'unsafe-inline'; ...\n"
             "<div style=\"text-align: center;\">  ·  @import url(\"https://fonts.googleapis.com/...\")",
        commits=["e534271"], archivo="setup/setup.php, index.php, mostrar_carrito.php, css/style.css",
        orig="""header("Content-Security-Policy: default-src 'self'; script-src 'self';
        style-src 'self' 'unsafe-inline'; ...");
<div style="text-align: center;">
<a class="button" ... style="margin:0%">Seleccionar</a>""",
        nuevo="""header("Content-Security-Policy: default-src 'self'; script-src 'self';
        style-src 'self'; ...");
header('Cross-Origin-Opener-Policy: same-origin');
header('Cross-Origin-Resource-Policy: same-origin');
<div class="text-center">
<a class="button m-0" ...>Seleccionar</a>""",
        despues="Prueba 'VUL-22/29 Cabeceras' de tests/test_seguridad.py: falla si la CSP contiene "
                "'unsafe-inline' o si falta nosniff, X-Frame-Options, HSTS o la cookie segura.",
        estado="Corregido – verificado en AWS (17/10/2026)",
    ),
    dict(
        id="VUL-030", nombre="Librerías obsoletas y archivos sin uso publicados en el webroot",
        sev="Media", owasp="A06:2021 – Vulnerable and Outdated Components", asvs="V15 Secure Coding and Architecture (dependencias)",
        iso="A.8.8, A.5.21", asc="ASC-15",
        desc="Aunque VUL-025 actualizó jQuery y Bootstrap, seguían publicados y descargables componentes "
             "viejos sin uso: Bootstrap 4.1.3 dentro de vendors/fontawesome (CVE-2019-8331), jQuery "
             "Validation 1.11.1 (ReDoS, CVE-2021-21252 / CVE-2022-31147), jQuery Form 3.32 (2013), "
             "Magnific Popup 1.1.0, ajaxChimp, skrollr, nouislider, scripts de contacto/mail, demos HTML, "
             ".DS_Store y style.map. Un atacante puede cargarlos desde la propia origen (bypass de CSP "
             "'self' con gadgets de librerías viejas).",
        url="GET /vendors/fontawesome/bootstrap.bundle.min.js  ·  /js/jquery.validate.min.js  ·  /css/style.map",
        evid="vendors/fontawesome/bootstrap.bundle.min.js -> /*! Bootstrap v4.1.3 */  (HTTP 200)\n"
             "js/jquery.validate.min.js -> /*! jQuery Validation Plugin - v1.11.1 - 3/22/2013 */  (HTTP 200)",
        commits=["e71f454"], archivo="src/pnkSecurity/js/, vendors/, css/ (423 archivos eliminados)",
        orig="""<script src="vendors/nice-select/jquery.nice-select.min.js"></script>
<script src="vendors/Magnific-Popup/jquery.magnific-popup.min.js"></script>
<script src="js/jquery.ajaxchimp.min.js"></script>
// main.js
$('#mc_embed_signup').find('form').ajaxChimp();
$(".hero-banner__video").magnificPopup({...});""",
        nuevo="""<script src="vendors/jquery/jquery-3.7.1.min.js"></script>
<script src="vendors/bootstrap/bootstrap.bundle.min.js"></script>   <!-- 4.6.2 -->
<script src="vendors/owl-carousel/owl.carousel.min.js"></script>
<script src="js/main.js"></script>
<script src="js/controladorajax.js"></script>
// webroot final: 4 librerías (jQuery 3.7.1, Bootstrap 4.6.2, Owl 2.3.4, Themify)""",
        despues="Prueba 'VUL-19/25/30 Archivos': las rutas de las librerías retiradas responden 404.",
        estado="Corregido – verificado en AWS (17/10/2026)",
    ),
    dict(
        id="VUL-031", nombre="Fuerza bruta distribuida contra una cuenta y retención indefinida de IPs",
        sev="Baja", owasp="A07:2021 – Identification and Authentication Failures", asvs="V6 Authentication (anti-automatización)",
        iso="A.8.5, A.5.34", asc="ASC-07, ASC-11",
        desc="Tras VUL-024 el límite era solo por IP: una botnet con muchas IP podía probar contraseñas "
             "contra una misma cuenta sin tope. Además login_intentos guardaba IPs (dato personal) para "
             "siempre.",
        url="POST /setup/procesalogin.php desde muchas IP",
        evid="WHERE ip = ? AND creado > ...   -> cada IP nueva parte con contador 0\n"
             "login_intentos sin borrado de registros antiguos",
        commits=["e3b4e54"], archivo="src/pnkSecurity/setup/procesalogin.php",
        orig="""$intentos = consulta_fila("SELECT COUNT(*) AS por_ip, ... FROM login_intentos
   WHERE ip = ? AND creado > (NOW() - INTERVAL 15 MINUTE)", 'ss', $email, $ip);""",
        nuevo="""consulta("DELETE FROM login_intentos WHERE creado < (NOW() - INTERVAL 24 HOUR)");
$global = consulta_fila("SELECT COUNT(*) AS total FROM login_intentos
   WHERE email = ? AND creado > (NOW() - INTERVAL 15 MINUTE)", 's', $email);
if (... || (int) $global['total'] >= MAX_INTENTOS_GLOBAL) {   // 30
    registrar_evento('login_bloqueado', 'cuenta=' . $email);""",
        despues="Máximo 30 intentos por cuenta cada 15 min desde cualquier IP (≈120/h). Con las claves "
                "aleatorias de 24 caracteres generadas al desplegar (VUL-023) un ataque en línea es "
                "impracticable. Las IP se eliminan a las 24 h.",
        estado="Corregido – verificado por revisión de código",
    ),
    dict(
        id="VUL-032", nombre="Registro insuficiente de eventos de seguridad",
        sev="Baja", owasp="A09:2021 – Security Logging and Monitoring Failures", asvs="V16 Security Logging and Error Handling",
        iso="A.8.15, A.8.16", asc="ASC-27, ASC-31",
        desc="Los ataques (CSRF rechazados, accesos denegados, logins fallidos, bloqueos) no quedaban "
             "registrados en ningún log, por lo que no era posible detectarlos ni investigarlos.",
        url="procesalogin.php, grcomentarios.php, validar_csrf()",
        evid="responder_error(403, ...) sin ningún registro del evento",
        commits=["e534271", "e3b4e54"], archivo="setup/setup.php, setup/procesalogin.php, grcomentarios.php",
        orig="""if (!hash_equals($_SESSION['csrf_token'], $enviado)) {
    responder_error(403, 'Solicitud rechazada: token CSRF inválido o ausente.');
}""",
        nuevo="""function registrar_evento($tipo, $detalle = '') {
    $limpio = preg_replace('/[\\x00-\\x1F\\x7F]/', ' ', (string) $detalle);  // anti log injection
    error_log(sprintf('[pnkSecurity][seguridad] %s ip=%s ruta=%s %s', $tipo, $ip, $ruta,
                      mb_substr($limpio, 0, 200)));
}
registrar_evento('csrf_rechazado');      registrar_evento('login_fallido', ...);
registrar_evento('login_bloqueado', ...); registrar_evento('acceso_denegado', ...);""",
        despues="En la instancia: grep '\\[seguridad\\]' /var/log/apache2/pnk_error.log muestra los eventos "
                "generados por test_seguridad.py (sin contraseñas ni tokens).",
        estado="Corregido – verificado en AWS (17/10/2026)",
    ),
    dict(
        id="VUL-033", nombre="Aplicación publicada por HTTP plano si falla el certificado TLS",
        sev="Media", owasp="A02:2021 – Cryptographic Failures", asvs="V12 Secure Communication",
        iso="A.8.20, A.8.24", asc="ASC-06, ASC-12",
        desc="Si Let's Encrypt fallaba, user-data.sh solo mostraba un aviso y la aplicación quedaba en "
             "http:// con el formulario de login: las contraseñas viajarían sin cifrar.",
        url="http://<ip-aws>.sslip.io/index.php?id=1 (cuando certbot falla)",
        evid="certbot ... || echo \"AVISO: no se pudo emitir el certificado; el sitio queda solo en HTTP\"",
        commits=["c617a06"], archivo="deploy/user-data.sh",
        orig="""certbot --apache -d "$DOMINIO" --non-interactive --agree-tos \\
        --register-unsafely-without-email --redirect \\
    || echo "AVISO: no se pudo emitir el certificado; el sitio queda solo en HTTP\"""",
        nuevo="""for intento in 1 2 3; do
    if certbot --apache -d "$DOMINIO" ... --redirect; then CERT_OK=1; break; fi
    sleep 60
done
if [ "$CERT_OK" != "1" ]; then     # fail-closed: nunca login por HTTP
    <VirtualHost *:80> RedirectMatch 503 ^/ </VirtualHost>
fi
# + FilesMatch deniega también .map .json .txt .sh .py config.*.php""",
        despues="Con certificado: http:// redirige 301 a https://. Sin certificado: HTTP 503, la "
                "aplicación nunca se sirve sin cifrar.",
        estado="Corregido – verificado en AWS (17/10/2026)",
    ),
    dict(
        id="VUL-034", nombre="Cabeceras de seguridad duplicadas (Apache + PHP)",
        sev="Baja", owasp="A05:2021 – Security Misconfiguration", asvs="V3 Web Frontend Security",
        iso="A.8.9", asc="ASC-06, ASC-20",
        desc="Detectado por tests/test_seguridad.py al desplegar en AWS: Apache agregaba X-Content-Type-"
             "Options, X-Frame-Options y Referrer-Policy además de las que ya envía PHP. El navegador recibe "
             "\"nosniff, nosniff\" y \"DENY, DENY\"; algunos navegadores y proxies descartan valores "
             "repetidos, con lo que la protección contra MIME sniffing y clickjacking puede quedar sin efecto "
             "(la CSP frame-ancestors 'none' sigue protegiendo el framing).",
        url="https://<ip-aws>.sslip.io/index.php?id=1 (cabeceras de respuesta)",
        evid="X-Content-Type-Options: nosniff\nX-Frame-Options: DENY\n...\nX-Content-Type-Options: nosniff\n"
             "X-Frame-Options: DENY\n  [FALLA] VUL-22/29 Cabeceras -> FALTAN: nosniff, X-Frame-Options",
        commits=["62c29e9"], archivo="deploy/user-data.sh, src/pnkSecurity/.htaccess",
        orig="""Header always set X-Content-Type-Options "nosniff"
Header always set X-Frame-Options "DENY"
Header always set Referrer-Policy "strict-origin-when-cross-origin" """,
        nuevo="""# PHP también envía estas cabeceras; se quita su copia y Apache deja una sola
Header unset X-Content-Type-Options
Header always set X-Content-Type-Options "nosniff"
Header unset X-Frame-Options
Header always set X-Frame-Options "DENY"
Header unset Referrer-Policy
Header always set Referrer-Policy "strict-origin-when-cross-origin" """,
        despues="Aplicado en la instancia y recargado Apache: cada cabecera aparece una sola vez "
                "(también en las respuestas 403).\n"
                "  [PASA] VUL-22/29 Cabeceras -> todas presentes\n"
                "RESULTADO: 9 de 9 pruebas en PASA.",
        estado="Corregido – verificado en AWS (17/10/2026)",
    ),
    dict(
        id="VUL-035", nombre="Versión de Apache visible en cabeceras y páginas de error",
        sev="Baja", owasp="A05:2021 – Security Misconfiguration", asvs="V13 Configuration",
        iso="A.8.9", asc="ASC-06, ASC-26",
        desc="Detectado en las capturas del 18/10/2026: las páginas 403/404 y la cabecera Server mostraban "
             "\"Apache/2.4.58 (Ubuntu)\". El archivo de endurecimiento se cargaba antes que security.conf de "
             "Ubuntu, que volvía a activar ServerTokens OS y ServerSignature On. Conocer la versión exacta "
             "facilita buscar CVE específicos del servidor.",
        url="Cualquier respuesta; visible en /setup/setup.php (403) y rutas inexistentes (404)",
        evid="Server: Apache/2.4.58 (Ubuntu)\n"
             "Forbidden ... Apache/2.4.58 (Ubuntu) Server at 174-129-56-84.sslip.io Port 443",
        commits=["baf7250"], archivo="deploy/user-data.sh, tests/test_seguridad.py",
        orig="""cat > /etc/apache2/conf-available/pnk-hardening.conf <<'CONF'
ServerTokens Prod
ServerSignature Off
CONF
a2enconf pnk-hardening      # se carga ANTES que security.conf (ServerTokens OS)""",
        nuevo="""# "zz-" para cargarse DESPUÉS de security.conf de Ubuntu
cat > /etc/apache2/conf-available/zz-pnk-hardening.conf <<'CONF'
ServerTokens Prod
ServerSignature Off
CONF
sed -i 's/^ServerTokens .*/ServerTokens Prod/; s/^ServerSignature .*/ServerSignature Off/' \\
    /etc/apache2/conf-available/security.conf
a2enconf zz-pnk-hardening
# test_seguridad.py: falla si la cabecera Server contiene un número de versión""",
        despues="Con el nuevo user-data.sh: Server: Apache (sin versión) y páginas de error sin firma. "
                "Se verifica con la prueba 'VUL-22/29 Cabeceras' en el próximo despliegue.",
        estado="Corregido en código – aplicar en AWS",
    ),
]

# Ruta exacta de cada vulnerabilidad (se completa con el host de cada versión
# al generar el informe, para mostrar la URL completa).
RUTAS = {
    "VUL-001": "/setup/procesalogin.php",
    "VUL-002": "/index.php?id=0 UNION SELECT 1-- -",
    "VUL-003": "/index.php?id=0 UNION SELECT 1-- -",
    "VUL-004": "/index.php?id=0 UNION SELECT 1-- -",
    "VUL-005": "/index.php?id=0 UNION SELECT 1-- -",
    "VUL-006": "/mostrar_carrito.php?id=1 OR 1=1",
    "VUL-007": "/carrito.php",
    "VUL-008": "/grcomentarios.php",
    "VUL-009": "/setup/procesalogin.php",
    "VUL-010": "/index.php?id=1",
    "VUL-011": "/setup/procesalogin.php",
    "VUL-012": "/grcomentarios.php",
    "VUL-013": "/carrito.php",
    "VUL-014": "/grcomentarios.php",
    "VUL-015": "/index.php?id=999",
    "VUL-016": "/carrito.php",
    "VUL-017": "/setup/procesalogin.php",
    "VUL-018": "/setup/procesalogin.php",
    "VUL-019": "/setup/setup.php",
    "VUL-020": "/carrito.php",
    "VUL-021": "/index.php?id=1'",
    "VUL-022": "/index.php?id=1",
    "VUL-023": "/setup/procesalogin.php",
    "VUL-024": "/setup/procesalogin.php",
    "VUL-025": "/vendors/jquery/jquery-3.2.1.min.js",
    "VUL-026": "/grcomentarios.php",
    "VUL-027": "/index.php?id=1",
    "VUL-028": "/index.php?id=1",
    "VUL-029": "/index.php?id=1",
    "VUL-030": "/vendors/fontawesome/bootstrap.bundle.min.js",
    "VUL-031": "/setup/procesalogin.php",
    "VUL-032": "/grcomentarios.php",
    "VUL-033": "/index.php?id=1",
    "VUL-034": "/index.php?id=1",
    "VUL-035": "/setup/setup.php",
}

ORDEN_SEV = {"Crítica": 0, "Alta": 1, "Media-Alta": 2, "Media": 3, "Baja": 4}
VULNS.sort(key=lambda v: (int(v["id"][4:])))

# ------------------------------------------------------------------------------
# Utilidades de formato
# ------------------------------------------------------------------------------
AZUL = RGBColor(0x1F, 0x3A, 0x5F)
ROJO = RGBColor(0xB0, 0x24, 0x18)
VERDE = RGBColor(0x1E, 0x6B, 0x34)
SEV_COLOR = {"Crítica": "8B0000", "Alta": "C0392B", "Media-Alta": "D35400", "Media": "E67E22", "Baja": "2E86C1"}


def sombrear(celda, color):
    tcPr = celda._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), color)
    tcPr.append(shd)


def hipervinculo(parrafo, url, texto):
    r_id = parrafo.part.relate_to(url, "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink", is_external=True)
    h = OxmlElement("w:hyperlink")
    h.set(qn("r:id"), r_id)
    run = OxmlElement("w:r")
    rPr = OxmlElement("w:rPr")
    color = OxmlElement("w:color")
    color.set(qn("w:val"), "0563C1")
    u = OxmlElement("w:u")
    u.set(qn("w:val"), "single")
    rPr.append(color)
    rPr.append(u)
    run.append(rPr)
    t = OxmlElement("w:t")
    t.text = texto
    run.append(t)
    h.append(run)
    parrafo._p.append(h)


def codigo(doc, texto, fondo="F4F4F4", separar=True):
    tabla = doc.add_table(rows=1, cols=1)
    tabla.alignment = WD_TABLE_ALIGNMENT.CENTER
    celda = tabla.cell(0, 0)
    sombrear(celda, fondo)
    p = celda.paragraphs[0]
    lineas = texto.split("\n")
    for i, linea in enumerate(lineas):
        run = p.add_run(linea)
        run.font.name = "Consolas"
        run._element.rPr.rFonts.set(qn("w:eastAsia"), "Consolas")
        run.font.size = Pt(8)
        if i < len(lineas) - 1:
            run.add_break()
    if separar:
        doc.add_paragraph()


def etiqueta(doc, texto, color=AZUL):
    p = doc.add_paragraph()
    r = p.add_run(texto)
    r.bold = True
    r.font.color.rgb = color
    p.paragraph_format.space_after = Pt(2)
    return p


def tabla_simple(doc, cabecera, filas, anchos=None, cab_color="1F3A5F"):
    t = doc.add_table(rows=1, cols=len(cabecera))
    t.style = "Table Grid"
    for i, txt in enumerate(cabecera):
        c = t.rows[0].cells[i]
        c.text = ""
        r = c.paragraphs[0].add_run(txt)
        r.bold = True
        r.font.size = Pt(8.5)
        r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        sombrear(c, cab_color)
    for fila in filas:
        celdas = t.add_row().cells
        for i, txt in enumerate(fila):
            celdas[i].text = ""
            r = celdas[i].paragraphs[0].add_run(str(txt))
            r.font.size = Pt(8.5)
    if anchos:
        for fila in t.rows:
            for i, w in enumerate(anchos):
                fila.cells[i].width = Cm(w)
    doc.add_paragraph()
    return t


CAPTURAS = Path(__file__).resolve().parent.parent / "docs" / "evidencias" / "capturas"


def captura(doc, vid, version):
    """Inserta docs/evidencias/capturas/<VUL-xxx>_<version>.png si existe."""
    img = CAPTURAS / f"{vid}_{version}.png"
    if not img.is_file():
        return
    doc.add_picture(str(img), width=Cm(16))
    doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(f"Captura: {vid} — versión {version} ({img.name})")
    r.italic = True
    r.font.size = Pt(8)


def estado(v):
    return v.get("estado", "Corregido – verificado")


# ------------------------------------------------------------------------------
# Documento
# ------------------------------------------------------------------------------
def construir(destino: Path):
    doc = Document()
    sec = doc.sections[0]
    sec.left_margin = sec.right_margin = Cm(2)
    sec.top_margin = sec.bottom_margin = Cm(2)
    estilo = doc.styles["Normal"]
    estilo.font.name = "Calibri"
    estilo.font.size = Pt(10.5)
    estilo.paragraph_format.space_after = Pt(4)

    # Portada -------------------------------------------------------------------
    for _ in range(5):
        doc.add_paragraph()
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("INFORME DE VULNERABILIDADES Y CORRECCIONES")
    r.bold = True
    r.font.size = Pt(22)
    r.font.color.rgb = AZUL
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("Aplicación pnkSecurity (PHP + MySQL) — Desarrollo Seguro")
    r.font.size = Pt(14)
    doc.add_paragraph()
    tabla_simple(doc, ["Ítem", "Detalle"], [
        ["Fecha", FECHA],
        ["Integrantes", "Matías Zepeda Arrieta · Joaquín Andrés Zambra Zúñiga"],
        ["Docente", "Jorge Cortés"],
        ["Repositorio", REPO],
        ["Código vulnerable", "rama main (commit 8d54176)"],
        ["Código corregido", "rama mejoras (un commit por grupo de vulnerabilidades)"],
        ["Versión en AWS", "rama mejoras — versión sin vulnerabilidades (sección 5)"],
        ["Hallazgos", "35 (9 Críticos · 5 Altos · 1 Media-Alta · 9 Medios · 11 Bajos) — todos corregidos"],
    ], anchos=[4.5, 12.5])
    doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)

    # 1. Resumen ------------------------------------------------------------------
    doc.add_heading("1. Resumen ejecutivo", level=1)
    doc.add_paragraph(
        "Se auditó la aplicación pnkSecurity (menú digital de restaurantes) mediante revisión manual de "
        "código (caja blanca) y pruebas dinámicas que repiten cada ataque contra la versión original y "
        "la corregida. La primera auditoría identificó 22 hallazgos (informe_pentesting_inicial.docx); "
        "una segunda revisión sobre la versión corregida y su despliegue agregó 5 más (VUL-023 a VUL-027) "
        "y una tercera revisión completa (código, librerías publicadas y aprovisionamiento de AWS) agregó "
        "6 más (VUL-028 a VUL-033). El testing en AWS del 17/10/2026 detectó una más (VUL-034) y las capturas del 18/10/2026 otra (VUL-035)."
    )
    doc.add_paragraph(
        "Las 35 vulnerabilidades quedaron corregidas en la rama mejoras y la versión publicada en AWS pasa las 9 pruebas automáticas. Las vulnerabilidades principales incluyen capturas de pantalla del ataque en la versión original y del bloqueo en la corregida. "
        "VUL-001 a VUL-026 tienen evidencia de prueba (el ataque falla en la versión corregida). VUL-027 a "
        "VUL-033 se verifican con tests/test_seguridad.py (9 pruebas automáticas) y con la configuración "
        "versionada del despliegue, y se re-evidencian en cada despliegue con deploy/desplegar_y_evidenciar.ps1."
    )
    doc.add_paragraph(
        "Causa raíz: ausencia sistemática de consultas preparadas, de validación de tipos y de "
        "codificación de salida. La corrección se hizo de forma transversal: setup.php concentra una "
        "única función de acceso a datos con consultas preparadas, la validación de enteros, la "
        "codificación HTML, los tokens CSRF, la sesión segura y las cabeceras HTTP."
    )

    doc.add_heading("Estructura de cada hallazgo", level=2)
    doc.add_paragraph("Cada vulnerabilidad de la sección 3 se documenta con:")
    for item in ["Vulnerabilidad — nombre y severidad",
                 "OWASP — categoría Top 10:2021 y capítulo ASVS v5.0.0",
                 "Descripción",
                 "URL — endpoint o recurso afectado",
                 "Evidencia — ataque y resultado sobre la versión original",
                 "Corrección — commit Git, código original y código nuevo",
                 "Evidencia sin vulnerabilidad — mismo ataque sobre la versión corregida"]:
        doc.add_paragraph(item, style="List Bullet")

    # 2. Tabla resumen ----------------------------------------------------------------
    doc.add_heading("2. Resumen de hallazgos", level=1)
    filas = [[v["id"], v["nombre"], v["owasp"].split(" – ")[0], v["sev"], ", ".join(v["commits"]), estado(v)]
             for v in VULNS]
    t = tabla_simple(doc, ["ID", "Vulnerabilidad", "OWASP", "Severidad", "Commit", "Estado"], filas,
                     anchos=[1.8, 6.5, 1.8, 1.9, 2.3, 3.2])
    for i, v in enumerate(VULNS, start=1):
        sombrear(t.rows[i].cells[3], SEV_COLOR[v["sev"]])
        for r in t.rows[i].cells[3].paragraphs[0].runs:
            r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
            r.bold = True

    p = doc.add_paragraph("Comparar el código completo: ")
    hipervinculo(p, f"{REPO}/compare/main...mejoras", f"{REPO}/compare/main...mejoras")
    doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)

    # 3. Detalle --------------------------------------------------------------------
    doc.add_heading("3. Detalle de vulnerabilidades", level=1)
    doc.add_paragraph(
        f"URL base — versión original (rama main): {URL_ORIG}   ·   versión corregida (rama mejoras): "
        f"{URL_CORR}. En el laboratorio local: original http://127.0.0.1:8080 y corregida "
        "http://127.0.0.1:8000 (tests/lab_local.sh)."
    )
    for n, v in enumerate(VULNS):
        h = doc.add_heading(f"{v['id']} → {v['nombre']}", level=2)
        h.paragraph_format.page_break_before = n > 0

        info = doc.add_table(rows=0, cols=2)
        info.style = "Table Grid"
        for k, val in [("Vulnerabilidad", v["nombre"]),
                       ("Severidad", v["sev"]),
                       ("OWASP Top 10", v["owasp"]),
                       ("OWASP ASVS v5.0.0", v["asvs"]),
                       ("Descripción", v["desc"]),
                       ("URL original", URL_ORIG + RUTAS[v["id"]]),
                       ("URL corregida", URL_CORR + RUTAS[v["id"]]),
                       ("Petición / vector", v["url"]),
                       ("Archivo(s)", v["archivo"]),
                       ("ISO/IEC 27001:2022", v["iso"]),
                       ("ISO/IEC 27034 (ASC)", v["asc"]),
                       ("Estado", estado(v))]:
            fila = info.add_row().cells
            fila[0].text = ""
            rr = fila[0].paragraphs[0].add_run(k)
            rr.bold = True
            rr.font.size = Pt(9)
            sombrear(fila[0], "DCE6F0")
            fila[1].text = ""
            rv = fila[1].paragraphs[0].add_run(val)
            rv.font.size = Pt(9)
            if k == "Severidad":
                sombrear(fila[1], SEV_COLOR[v["sev"]])
                rv.bold = True
                rv.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        for fila in info.rows:
            fila.cells[0].width = Cm(3.8)
            fila.cells[1].width = Cm(13.2)
        doc.add_paragraph()

        etiqueta(doc, "Evidencia (versión original — vulnerable)", ROJO)
        codigo(doc, v["evid"], "FBEAEA")
        captura(doc, v["id"], "original")

        etiqueta(doc, "Corrección", AZUL)
        p = doc.add_paragraph("Commit Git: ")
        for i, c in enumerate(v["commits"]):
            if i:
                p.add_run("  ·  ")
            hipervinculo(p, f"{REPO}/commit/{C[c]}", c)
        p.add_run(f"   (rama mejoras)")

        etiqueta(doc, "Código original", ROJO)
        codigo(doc, v["orig"], "FBEAEA")
        etiqueta(doc, "Código nuevo", VERDE)
        codigo(doc, v["nuevo"], "EAF6EC")

        etiqueta(doc, "Evidencia sin vulnerabilidad (versión corregida)", VERDE)
        codigo(doc, v["despues"], "EAF6EC", separar=False)
        captura(doc, v["id"], "corregida")

    # 4. Testing ---------------------------------------------------------------------
    doc.add_heading("4. Evidencia de testing (sin vulnerabilidad)", level=1).paragraph_format.page_break_before = True
    doc.add_paragraph(
        "El script tests/test_seguridad.py repite los ataques contra ambas versiones; "
        "tests/lab_local.sh levanta las dos ramas en bases de datos aisladas para reproducirlo sin AWS. "
        "Resultados completos en docs/evidencias/resultado_testing.txt (AWS) y "
        "docs/evidencias/resultado_local.txt (local, 05/10/2026). Despliegue en AWS del 17/10/2026: "
        "la primera ejecución detectó VUL-034 (cabeceras duplicadas); tras corregirla, 9 de 9 pruebas en PASA."
    )
    codigo(doc, "pip install requests\n"
                "python tests/test_seguridad.py \\\n"
                f"    --vulnerable {URL_ORIG} \\\n"
                f"    --corregida  {URL_CORR}")
    etiqueta(doc, "Análisis estático (SAST) de la versión corregida", VERDE)
    codigo(doc, "semgrep scan --config p/php --config p/owasp-top-ten src/pnkSecurity\n"
                "Ran 94 rules on 19 files: 0 findings.        (17/10/2026, rama mejoras)\n"
                "\n"
                "GitHub Actions (.github/workflows/seguridad.yml) repite en cada push:\n"
                "  php -l (sintaxis) · Semgrep (SAST) · Gitleaks (secretos en el repositorio)", "EAF6EC")
    tabla_simple(doc, ["Prueba", "Original (main)", "Corregida (mejoras)"], [
        ["VUL-001 Login SQLi ' OR '1'='1' -- -", "Sesión abierta sin credenciales", "Bloqueado"],
        ["VUL-002..005 SQLi en id", "HTTP 200", "HTTP 404"],
        ["VUL-006 SQLi mostrar_carrito", "HTTP 200", "HTTP 404"],
        ["VUL-007 SQLi iditems", "Inyección aceptada", "HTTP 400"],
        ["VUL-009 Contraseñas", "Texto plano", "bcrypt $2y$12$ (60 chars)"],
        ["VUL-010 XSS almacenado", "<script> sin escapar", "&lt;script&gt; escapado"],
        ["VUL-011/012/013 CSRF", "Aceptado", "HTTP 403 sin token"],
        ["VUL-014 Comentario sin sesión", "HTTP 200", "HTTP 403"],
        ["VUL-015 IDOR id=999", "HTTP 200", "HTTP 404"],
        ["VUL-016 Ítem eliminado al carrito", "Agregado", "HTTP 404"],
        ["VUL-017 ID de sesión tras login", "Igual", "Cambia"],
        ["VUL-018/024 Fuerza bruta", "Ilimitado", "Bloqueo a los 5 fallos"],
        ["VUL-019 GET /setup/setup.php", "Accesible", "HTTP 403 (AWS)"],
        ["VUL-020 op=9", "Sin control", "HTTP 400"],
        ["VUL-021 ?id=1'", "Fatal error visible", "HTTP 404 sin traza"],
        ["VUL-022 Cabeceras", "Ausentes", "CSP, HSTS, XFO, nosniff, cookie segura"],
        ["VUL-025 jQuery", "3.2.1", "3.7.1 (3.2.1 → 404)"],
        ["VUL-026 6 comentarios seguidos", "6 guardados", "5 guardados, 6º rechazado"],
        ["VUL-027 :8080 tras el testing", "Publicado", "Cerrado en el Security Group"],
        ["VUL-028 X-Forwarded-Proto falso", "HSTS/Secure sobre HTTP", "Cabecera ignorada"],
        ["VUL-029 CSP", "style-src 'unsafe-inline'", "Sin 'unsafe-inline' + COOP/CORP"],
        ["VUL-030 Librerías viejas publicadas", "HTTP 200", "HTTP 404"],
        ["VUL-031 Fuerza bruta distribuida", "Sin tope por cuenta", "30 por cuenta / 15 min"],
        ["VUL-032 Eventos de seguridad", "Sin registro", "[seguridad] en el log"],
        ["VUL-033 Falla de certificado", "Login por HTTP", "HTTP 503 (fail-closed)"],
    ], anchos=[6.5, 4.5, 6])

    # 5. AWS -------------------------------------------------------------------------
    doc.add_heading("5. AWS — versión sin vulnerabilidades", level=1)
    doc.add_paragraph(
        "La versión corregida (rama mejoras) se despliega automáticamente en AWS EC2 con "
        "deploy/desplegar_aws.py y deploy/user-data.sh (commit 3b4bca9 + 534932c)."
    )
    tabla_simple(doc, ["Elemento", "Configuración"], [
        ["Servicio / región", "EC2 Ubuntu 24.04 · us-east-1"],
        ["URL corregida", URL_CORR + "/index.php?id=1"],
        ["Rama desplegada", "mejoras"],
        ["Red", "Security Group: 80/443 públicos; 22 y 8080 solo IP del tester"],
        ["TLS", "HTTPS obligatorio (Let's Encrypt), http → https 301, HSTS"],
        ["Base de datos", "Usuario pnk_app con privilegios mínimos y clave aleatoria (no root)"],
        ["Secretos", "SetEnv en /etc/apache2/pnk-secretos.conf (600), fuera del webroot"],
        ["Cuentas de prueba", "Claves aleatorias por despliegue en /root/pnk-credenciales.txt (600)"],
        ["Instancia", "IMDSv2 obligatorio, disco EBS cifrado, unattended-upgrades"],
        ["PHP / Apache", "display_errors=Off, expose_php=Off, setup.php y .sql denegados"],
        ["Versión original :8080", "Solo para evidencia, IP del tester, se retira sola a las 2 h"],
    ], anchos=[4.5, 12.5])
    doc.add_paragraph("Despliegue:")
    codigo(doc, "pip install boto3\n"
                "# credenciales de AWS Academy en ~/.aws/credentials\n"
                "python deploy/desplegar_aws.py --vulnerable --key vockey\n"
                "# esperar 5-8 min y luego ejecutar tests/test_seguridad.py")
    p = doc.add_paragraph()
    r = p.add_run("Nota: AWS Academy recicla las instancias al cerrar el laboratorio, por lo que la IP cambia "
                  "en cada despliegue. Reemplazar <IP-AWS> / <ip-aws> en este informe por la IP entregada "
                  "por desplegar_aws.py.")
    r.italic = True

    # 6. Privacidad + Gate --------------------------------------------------------------
    doc.add_heading("6. Protección de datos personales", level=1)
    doc.add_paragraph(
        "La aplicación trata datos personales básicos: correo y nombre de usuarios internos, nombre del "
        "autor de cada comentario y dirección IP en la tabla login_intentos. No trata datos sensibles. "
        "A la fecha del informe (17/10/2026) rige la Ley N° 19.628; la Ley N° 21.719 entra en vigencia el "
        "01/12/2026, por lo que se considera como requisito de adecuación."
    )
    for txt in [
        "Seguridad del tratamiento: las correcciones VUL-001..009 y VUL-019 eliminan las vías de acceso "
        "no autorizado a la tabla usuarios y protegen las contraseñas con bcrypt.",
        "Minimización: el comentario ya no recibe el nombre desde el formulario; se toma de la sesión.",
        "Retención: los intentos de login (IP y correo) se eliminan a las 24 horas (VUL-031); solo se "
        "muestran los 50 comentarios más recientes.",
        "Datos de prueba: el despliegue usa solo los datos ficticios del script SQL y genera claves "
        "aleatorias para las cuentas de prueba (VUL-023).",
        "Registro: los eventos de seguridad se registran sin contraseñas ni tokens (VUL-032).",
    ]:
        doc.add_paragraph(txt, style="List Bullet")

    doc.add_heading("7. Security Gate y riesgo residual", level=1)
    tabla_simple(doc, ["Campo", "Resultado"], [
        ["Aplicación / versión", "pnkSecurity · rama mejoras"],
        ["Resultado", "APROBADO (VUL-035 se aplica en AWS con el próximo despliegue)"],
        ["Hallazgos abiertos", "0 de 35 en el código (críticos 0 · altos 0 · medios 0 · bajos 0)"],
        ["Controles automáticos", "tests/test_seguridad.py (9 pruebas) + GitHub Actions: php -l, Semgrep (SAST) y Gitleaks (secretos) en cada push"],
        ["Condición de liberación", "desplegar_y_evidenciar.ps1 debe terminar con todas las pruebas en PASA y el puerto 8080 cerrado"],
        ["Riesgo residual", "Bajo y aceptado: el tope de 30 intentos por cuenta permite bloquear temporalmente (15 min) "
                            "una cuenta con un ataque sostenido; se prefirió frente a permitir fuerza bruta distribuida."],
    ], anchos=[4.5, 12.5])
    p = doc.add_paragraph()
    r = p.add_run("Los capítulos ASVS se citan a nivel de capítulo (v5.0.0). El identificador exacto de cada "
                  "requisito debe validarse contra la fuente oficial de OWASP ASVS antes de usarlo en una "
                  "auditoría formal. Los ASC-xx son una taxonomía corporativa, no numeración oficial de ISO/IEC 27034.")
    r.italic = True
    r.font.size = Pt(8.5)

    destino.parent.mkdir(parents=True, exist_ok=True)
    doc.save(destino)
    print(f"Informe generado: {destino}  ({len(VULNS)} vulnerabilidades)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--ip", help="IP elástica del despliegue en AWS (reemplaza <IP-AWS>)")
    ap.add_argument("--ip-original", help="IP donde se publicó la versión original en :8080, si es otra")
    args = ap.parse_args()
    if args.ip:
        URL_ORIG = f"http://{args.ip_original or args.ip}:8080"
        URL_CORR = f"https://{args.ip.replace('.', '-')}.sslip.io"
        for v in VULNS:
            for k in ("url", "evid", "despues"):
                v[k] = v[k].replace("http://<IP-AWS>:8080", URL_ORIG).replace("https://<ip-aws>.sslip.io", URL_CORR)
    raiz = Path(__file__).resolve().parent.parent
    construir(raiz / "docs" / "informe_vulnerabilidades.docx")
