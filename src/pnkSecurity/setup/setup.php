<?php
/*
 * Configuración central de la aplicación (versión corregida).
 *
 * - VUL019: las credenciales de la BD ya no están en el código; se leen de
 *   variables de entorno (SetEnv en Apache) o de setup/config.local.php
 *   (excluido de Git, ver config.example.php).
 * - VUL021: errores controlados; nunca se muestran detalles técnicos al usuario.
 * - VUL022: cabeceras de seguridad HTTP y cookie de sesión con HttpOnly,
 *   SameSite y Secure (cuando hay HTTPS).
 * - Helpers comunes: consultas preparadas, validación de enteros,
 *   codificación de salida y tokens anti-CSRF.
 */

ini_set('display_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

// ---------------------------------------------------------------------------
// Configuración (VUL019)
// ---------------------------------------------------------------------------
function config($clave)
{
    static $local = null;
    $valor = getenv($clave);
    if ($valor !== false && $valor !== '') {
        return $valor;
    }
    if ($local === null) {
        $archivo = __DIR__ . '/config.local.php';
        $local = is_file($archivo) ? (array) require $archivo : [];
    }
    return $local[$clave] ?? null;
}

// ---------------------------------------------------------------------------
// Manejo de errores (VUL021)
// ---------------------------------------------------------------------------
function responder_error($codigo, $mensaje)
{
    if (!headers_sent()) {
        http_response_code($codigo);
        header('Content-Type: text/html; charset=UTF-8');
    }
    echo '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Error ' . (int) $codigo . '</title>'
       . '<link rel="stylesheet" href="/vendors/bootstrap/bootstrap.min.css"></head><body><div class="container text-center" style="margin-top:60px">'
       . '<h3>' . e($mensaje) . '</h3><a href="/index.php?id=1">Volver</a></div></body></html>';
    exit;
}

function responder_json($codigo, $datos)
{
    http_response_code($codigo);
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode($datos);
    exit;
}

set_exception_handler(function ($ex) {
    // El detalle queda solo en el log del servidor, nunca en la respuesta.
    error_log('[pnkSecurity] ' . get_class($ex) . ': ' . $ex->getMessage() . ' en ' . $ex->getFile() . ':' . $ex->getLine());
    responder_error(500, 'Ocurrió un error inesperado. Intente nuevamente más tarde.');
});

// ---------------------------------------------------------------------------
// Base de datos: una sola conexión y solo consultas preparadas
// ---------------------------------------------------------------------------
function conectar()
{
    static $con = null;
    if ($con === null) {
        mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
        $con = new mysqli(
            config('PNK_DB_HOST') ?? 'localhost',
            config('PNK_DB_USER'),
            config('PNK_DB_PASS'),
            config('PNK_DB_NAME') ?? 'pnk_security'
        );
        $con->set_charset('utf8mb4');
    }
    return $con;
}

/**
 * Ejecuta una consulta preparada. $tipos sigue la convención de bind_param
 * ("i" entero, "s" string). Retorna el mysqli_result (SELECT) o el statement.
 */
function consulta($sql, $tipos = '', ...$params)
{
    $stmt = conectar()->prepare($sql);
    if ($tipos !== '') {
        $stmt->bind_param($tipos, ...$params);
    }
    $stmt->execute();
    return $stmt->field_count > 0 ? $stmt->get_result() : $stmt;
}

function consulta_fila($sql, $tipos = '', ...$params)
{
    return consulta($sql, $tipos, ...$params)->fetch_assoc();
}

function consulta_todas($sql, $tipos = '', ...$params)
{
    return consulta($sql, $tipos, ...$params)->fetch_all(MYSQLI_ASSOC);
}

// ---------------------------------------------------------------------------
// Validación de entradas (VUL020)
// ---------------------------------------------------------------------------
function entero_positivo($valor)
{
    if (is_int($valor)) {
        return $valor > 0 ? $valor : false;
    }
    if (!is_string($valor) || !preg_match('/^[0-9]{1,9}$/', $valor)) {
        return false;
    }
    $n = (int) $valor;
    return $n > 0 ? $n : false;
}

function exigir_post()
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        header('Allow: POST');
        responder_error(405, 'Método no permitido.');
    }
}

// ---------------------------------------------------------------------------
// Codificación de salida (VUL010)
// ---------------------------------------------------------------------------
function e($texto)
{
    return htmlspecialchars((string) $texto, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

// ---------------------------------------------------------------------------
// Sesión y cabeceras de seguridad (VUL017, VUL022)
// ---------------------------------------------------------------------------
function es_https()
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
}

function enviar_cabeceras_seguridad()
{
    header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
    header('Cache-Control: no-store');
    if (es_https()) {
        header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
    }
    header_remove('X-Powered-By');
}

function iniciar_sesion()
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    ini_set('session.use_trans_sid', '0');
    session_name('PNKSESSID');
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'secure'   => es_https(),
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    session_start();

    // Expiración por inactividad (30 minutos).
    $ahora = time();
    if (isset($_SESSION['ultimo_acceso']) && $ahora - $_SESSION['ultimo_acceso'] > 1800) {
        $_SESSION = [];
        session_regenerate_id(true);
    }
    $_SESSION['ultimo_acceso'] = $ahora;
    if (!isset($_SESSION['carrito']) || !is_array($_SESSION['carrito'])) {
        $_SESSION['carrito'] = [];
    }
}

function usuario_autenticado()
{
    return isset($_SESSION['usuario_id']);
}

// ---------------------------------------------------------------------------
// Tokens anti-CSRF (VUL011, VUL012, VUL013)
// ---------------------------------------------------------------------------
function token_csrf()
{
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function validar_csrf()
{
    $enviado = $_POST['csrf_token'] ?? ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    if (!is_string($enviado) || empty($_SESSION['csrf_token']) || !hash_equals($_SESSION['csrf_token'], $enviado)) {
        responder_error(403, 'Solicitud rechazada: token CSRF inválido o ausente.');
    }
}

// ---------------------------------------------------------------------------
// Utilidades de presentación (sin cambios funcionales)
// ---------------------------------------------------------------------------
function quitarespacios($titulo)
{
    return str_replace([' ', 'ñ', 'Ñ'], '', (string) $titulo);
}

function moneda_chilena($numero)
{
    return '$ ' . number_format((int) $numero, 0, ',', '.');
}

enviar_cabeceras_seguridad();
