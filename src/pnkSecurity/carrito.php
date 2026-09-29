<?php

include("setup/setup.php");
session_start();

switch($_POST['op'])
{
    case "1": insertar();
        break;
    case "2": eliminaritems();
        break;
    case "3": eliminartodo();
        break;
}

function insertar()
{
    $_SESSION["carrito"];
    $sql="select id, nombre, precio from items where id=".$_POST['iditems'];
    $result=mysqli_query(conectar(),$sql);
    $datos=mysqli_fetch_array($result);

    $pos=count($_SESSION["carrito"])+1;
    $productos = array("posicion"=>$pos,"id" => $datos['id'], "nombre" =>$datos['nombre'],"precio"=>$datos['precio']);
    $_SESSION["carrito"][$pos] = $productos;
}

function eliminaritems()
{
    unset($_SESSION["carrito"][$_POST['pos']]);
}

function eliminartodo()
{
    session_destroy();
}
?>