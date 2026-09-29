<?php
/*
 * Operaciones del carrito vía AJAX (versión corregida).
 * VUL013: exige POST y token anti-CSRF (cabecera X-CSRF-Token).
 * VUL007 / VUL020: parámetros validados como enteros y consulta preparada.
 * VUL016: solo se agregan ítems visibles, no eliminados y pertenecientes al
 *         restaurante que el usuario está consultando.
 */

include("setup/setup.php");
iniciar_sesion();
exigir_post();
validar_csrf();

const MAX_ITEMS_CARRITO = 50;

switch ($_POST['op'] ?? '')
{
    case "1": insertar();
        break;
    case "2": eliminaritems();
        break;
    case "3": eliminartodo();
        break;
    default:
        responder_json(400, ['ok' => false, 'error' => 'Operación no válida.']);
}

function insertar()
{
    $iditem = entero_positivo($_POST['iditems'] ?? null);
    $restaurante = entero_positivo($_SESSION['id'] ?? null);
    if ($iditem === false || $restaurante === false) {
        responder_json(400, ['ok' => false, 'error' => 'Producto no válido.']);
    }
    if (count($_SESSION['carrito']) >= MAX_ITEMS_CARRITO) {
        responder_json(409, ['ok' => false, 'error' => 'El carrito está lleno.']);
    }

    $datos = consulta_fila(
        "SELECT items.id, items.nombre, items.precio
         FROM items
         INNER JOIN categorias ON items.categorias_id = categorias.id
         INNER JOIN cartas ON categorias.cartas_id = cartas.id
         WHERE items.id = ? AND items.visible = 1 AND items.eliminado IS NULL
           AND categorias.visible = 1 AND categorias.eliminado IS NULL
           AND cartas.visible = 1 AND cartas.eliminada IS NULL
           AND cartas.restautantes_id = ?",
        'ii', $iditem, $restaurante
    );
    if ($datos === null) {
        responder_json(404, ['ok' => false, 'error' => 'Producto no disponible.']);
    }

    $pos = empty($_SESSION['carrito']) ? 1 : max(array_keys($_SESSION['carrito'])) + 1;
    $_SESSION['carrito'][$pos] = [
        "posicion" => $pos,
        "id"       => (int) $datos['id'],
        "nombre"   => $datos['nombre'],
        "precio"   => (int) $datos['precio'],
    ];
    responder_json(200, ['ok' => true]);
}

function eliminaritems()
{
    $pos = entero_positivo($_POST['pos'] ?? null);
    if ($pos === false) {
        responder_json(400, ['ok' => false, 'error' => 'Posición no válida.']);
    }
    unset($_SESSION['carrito'][$pos]);
    responder_json(200, ['ok' => true]);
}

function eliminartodo()
{
    // Se vacía solo el carrito; destruir la sesión cerraba también la sesión
    // del usuario autenticado.
    $_SESSION['carrito'] = [];
    responder_json(200, ['ok' => true]);
}
