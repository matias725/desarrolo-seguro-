<?php
/*
 * Registro de comentarios (versión corregida).
 * VUL014: la autorización se valida en el servidor (no solo en la interfaz).
 * VUL012: exige POST y token anti-CSRF.
 * VUL008: INSERT con consulta preparada.
 * VUL010: el autor se toma de la sesión; el texto se guarda tal cual y se
 *         codifica al mostrarlo (index.php usa e()).
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

$comentario = trim((string) ($_POST['comentario'] ?? ''));
$largo = mb_strlen($comentario, 'UTF-8');
if ($largo === 0 || $largo > 1000) {
    $_SESSION['flash'] = 'El comentario debe tener entre 1 y 1000 caracteres.';
    header('Location: index.php?id=' . $restaurante);
    exit;
}

consulta(
    "INSERT INTO comentarios (usuario, comentario, id_restaurante) VALUES (?, ?, ?)",
    'ssi', $_SESSION['nombre'], $comentario, $restaurante
);

header('Location: index.php?id=' . $restaurante);
exit;
