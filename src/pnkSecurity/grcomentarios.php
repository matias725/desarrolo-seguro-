<?php
/*
 * Registro de comentarios (versión corregida).
 * VUL014: la autorización se valida en el servidor (no solo en la interfaz).
 * VUL012: exige POST y token anti-CSRF.
 * VUL008: INSERT con consulta preparada.
 * VUL010: el autor se toma de la sesión; el texto se guarda tal cual y se
 *         codifica al mostrarlo (index.php usa e()).
 * VUL026: máximo de comentarios por usuario en una ventana de tiempo, para
 *         evitar spam e inundación de la página.
 */

include("setup/setup.php");
iniciar_sesion();
exigir_post();

if (!usuario_autenticado()) {
    responder_error(403, 'Debe iniciar sesión para comentar.');
}
validar_csrf();

$restaurante = entero_positivo($_SESSION['id'] ?? null);
if ($restaurante === false || consulta_fila(
        "SELECT id FROM restautantes WHERE id = ? AND eliminado IS NULL", 'i', $restaurante) === null) {
    responder_error(400, 'Restaurante no válido.');
}

const MAX_COMENTARIOS = 5;
const VENTANA_COMENTARIOS_MIN = 10;

$recientes = consulta_fila(
    "SELECT COUNT(*) AS total FROM comentarios
     WHERE usuario_id = ? AND creado > (NOW() - INTERVAL " . VENTANA_COMENTARIOS_MIN . " MINUTE)",
    'i', $_SESSION['usuario_id']
);
if ((int) $recientes['total'] >= MAX_COMENTARIOS) {
    $_SESSION['flash'] = 'Ha publicado demasiados comentarios. Intente nuevamente en unos minutos.';
    header('Location: index.php?id=' . $restaurante);
    exit;
}

$comentario = trim((string) ($_POST['comentario'] ?? ''));
$largo = mb_strlen($comentario, 'UTF-8');
if ($largo === 0 || $largo > 1000) {
    $_SESSION['flash'] = 'El comentario debe tener entre 1 y 1000 caracteres.';
    header('Location: index.php?id=' . $restaurante);
    exit;
}

consulta(
    "INSERT INTO comentarios (usuario, usuario_id, comentario, id_restaurante) VALUES (?, ?, ?, ?)",
    'sisi', $_SESSION['nombre'], $_SESSION['usuario_id'], $comentario, $restaurante
);

header('Location: index.php?id=' . $restaurante);
exit;
