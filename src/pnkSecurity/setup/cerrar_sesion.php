<?php
/*
 * Cierre de sesión (versión corregida): solo por POST con token anti-CSRF,
 * elimina los datos, la cookie y el identificador de la sesión.
 */

include("setup.php");
iniciar_sesion();
exigir_post();
validar_csrf();

$restaurante = entero_positivo($_SESSION['id'] ?? null);

$_SESSION = [];
$p = session_get_cookie_params();
setcookie(session_name(), '', [
    'expires'  => time() - 42000,
    'path'     => $p['path'],
    'secure'   => $p['secure'],
    'httponly' => $p['httponly'],
    'samesite' => $p['samesite'],
]);
session_destroy();

header('Location: ../index.php' . ($restaurante ? '?id=' . $restaurante : ''));
exit;
