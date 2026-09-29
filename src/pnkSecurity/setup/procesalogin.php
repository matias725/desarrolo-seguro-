<?php

include("setup.php");

$sql="select * from usuarios where email='".$_POST['frmusuario']."' and password='".$_POST['frmpassword']."'";
$result=mysqli_query(conectar(),$sql);
$cont_login=mysqli_num_rows($result);
$datos=mysqli_fetch_array($result);

if($cont_login!=0)
{
    session_start();
    $_SESSION['nombre']=$datos['nombre'];
    header('Location:../index.php');
}else{
    header('Location:../index.php'); 
}

?>