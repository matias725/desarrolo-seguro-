<?php

include("setup/setup.php");
session_start();

$sql="INSERT INTO comentarios SET usuario='".$_POST['usuario']."',comentario='".$_POST['comentario']."',id_restaurante=".$_SESSION['id'];
mysqli_query(conectar(),$sql);

header('Location:index.php?id='.$_SESSION['id'])


?>