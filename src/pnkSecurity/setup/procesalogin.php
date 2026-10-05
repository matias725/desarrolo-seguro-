<?php
/*
 * Autenticación (versión corregida).
 * VUL001: consulta preparada (sin SQL Injection).
 * VUL009: verificación con password_verify() contra hash bcrypt.
 * VUL011: exige POST y token anti-CSRF.
 * VUL017: regenera el ID de sesión tras autenticar.
 * VUL018: bloqueo temporal tras intentos fallidos.
 * VUL024: el bloqueo es por IP y por la pareja IP+cuenta. Un atacante ya no
 *         puede dejar sin acceso a otra persona fallando con su correo, porque
 *         sus intentos solo bloquean su propia IP. Además, un login exitoso
 *         con otra cuenta no reinicia el contador de la IP.
 */

include("setup.php");
iniciar_sesion();
exigir_post();
validar_csrf();

const MAX_INTENTOS_CUENTA = 5;   // por IP + correo
const MAX_INTENTOS_IP     = 10;  // por IP, sin importar el correo
const VENTANA_MINUTOS     = 15;

$email    = trim((string) ($_POST['frmusuario'] ?? ''));
$password = (string) ($_POST['frmpassword'] ?? '');
$ip       = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';

$restaurante = entero_positivo($_SESSION['id'] ?? null);
$destino = '../index.php' . ($restaurante ? '?id=' . $restaurante : '');

function volver_con_mensaje($destino, $mensaje)
{
    $_SESSION['flash'] = $mensaje;
    header('Location: ' . $destino);
    exit;
}

if ($email === '' || $password === '' || strlen($email) > 255 || strlen($password) > 255) {
    volver_con_mensaje($destino, 'Debe ingresar usuario y contraseña.');
}

// Límite de intentos (VUL018/VUL024): solo cuentan los fallos de esta IP.
$intentos = consulta_fila(
    "SELECT COUNT(*) AS por_ip, COALESCE(SUM(email = ?), 0) AS por_cuenta
     FROM login_intentos
     WHERE ip = ? AND creado > (NOW() - INTERVAL " . VENTANA_MINUTOS . " MINUTE)",
    'ss', $email, $ip
);
if ((int) $intentos['por_ip'] >= MAX_INTENTOS_IP || (int) $intentos['por_cuenta'] >= MAX_INTENTOS_CUENTA) {
    volver_con_mensaje($destino, 'Demasiados intentos fallidos. Intente nuevamente en ' . VENTANA_MINUTOS . ' minutos.');
}

$usuario = consulta_fila(
    "SELECT Id, nombre, password, estado FROM usuarios WHERE email = ? LIMIT 1",
    's', $email
);

// Se verifica siempre un hash (aunque el usuario no exista) para no revelar
// qué correos están registrados mediante diferencias de tiempo.
$hash = $usuario['password'] ?? '$2y$12$FpiqU2XFu81IFmQVzX5h4OZ8gOMxCx/wMNc5kZqHP0/..2GbvWW9q';
$valido = password_verify($password, $hash) && $usuario !== null && $usuario['estado'] === '1';

if (!$valido) {
    consulta("INSERT INTO login_intentos (ip, email) VALUES (?, ?)", 'ss', $ip, $email);
    volver_con_mensaje($destino, 'Usuario o contraseña incorrectos.');
}

// Se limpian solo los fallos de esta cuenta desde esta IP; el contador
// general de la IP sigue corriendo (VUL024).
consulta("DELETE FROM login_intentos WHERE ip = ? AND email = ?", 'ss', $ip, $email);

session_regenerate_id(true);
$_SESSION['usuario_id'] = (int) $usuario['Id'];
$_SESSION['nombre']     = $usuario['nombre'];
$_SESSION['csrf_token'] = bin2hex(random_bytes(32));

header('Location: ' . $destino);
exit;
