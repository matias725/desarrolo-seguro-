<?php
/*
 * Autenticación (versión corregida).
 * VUL001: consulta preparada (sin SQL Injection).
 * VUL009: verificación con password_verify() contra hash bcrypt.
 * VUL011: exige POST y token anti-CSRF.
 * VUL017: regenera el ID de sesión tras autenticar.
 * VUL018: bloqueo temporal tras 5 intentos fallidos en 15 minutos.
 */

include("setup.php");
iniciar_sesion();
exigir_post();
validar_csrf();

const MAX_INTENTOS = 5;
const VENTANA_MINUTOS = 15;

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

// Límite de intentos por IP o por cuenta.
$intentos = consulta_fila(
    "SELECT COUNT(*) AS total FROM login_intentos
     WHERE (ip = ? OR email = ?) AND creado > (NOW() - INTERVAL " . VENTANA_MINUTOS . " MINUTE)",
    'ss', $ip, $email
);
if ((int) $intentos['total'] >= MAX_INTENTOS) {
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

consulta("DELETE FROM login_intentos WHERE ip = ? OR email = ?", 'ss', $ip, $email);

session_regenerate_id(true);
$_SESSION['usuario_id'] = (int) $usuario['Id'];
$_SESSION['nombre']     = $usuario['nombre'];
$_SESSION['csrf_token'] = bin2hex(random_bytes(32));

header('Location: ' . $destino);
exit;
