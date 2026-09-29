<?php
include("setup/setup.php");
session_start();

$key=$_GET['id'];

$sql_restorant="SELECT direcciones.calle, direcciones.numero, direcciones.comuna, direcciones.region, restautantes.nombre, restautantes.id, restautantes.fono, restautantes.email, restautantes.foto FROM restautantes INNER JOIN direcciones ON restautantes.direcciones_id =
direcciones.id WHERE restautantes.id = ".$key;
$result_restorant=mysqli_query(conectar(),$sql_restorant);
$datos_restorant=mysqli_fetch_array($result_restorant);

?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="ie=edge">
  <title><?php echo $datos_restorant['nombre'];?></title>
	<!--<link rel="icon" href="img/Fevicon.png" type="image/png">-->

  <link rel="stylesheet" href="vendors/bootstrap/bootstrap.min.css">
  <link rel="stylesheet" href="vendors/themify-icons/themify-icons.css">
  <link rel="stylesheet" href="vendors/owl-carousel/owl.theme.default.min.css">
  <link rel="stylesheet" href="vendors/owl-carousel/owl.carousel.min.css">

  <link rel="stylesheet" href="css/style.css">
</head>
<body>
<section>
    <div class="container contendor">
      <div class="row">
        <div class="col-lg-4">
          <div style="text-align: center;">
            <div class="media">
              <img class="logosintituciones" src="img/logo.png" width="170px" alt="">
            </div><br><br>
          </div>  
        </div>
        <div class="col-lg-4">
          <div style="text-align: center;">
            
            <?php
              if($datos_restorant['foto']!="")
              {  
                ?>
                  <img class="logosintituciones" src="../imagenes/cod<?php echo $key;?>/<?php echo $datos_restorant['foto'];?>" width="170px" alt="">
              <?php
              }else{
                ?>
                  <img class="logosintituciones" src="img/logo_empresa_comodin.png" width="170px" alt="">
                <?php
              }
              ?>
            
          </div>  
        </div>
        <div class="col-lg-4">
          <div class="carro">
            <div class="media float-right">
              <a class="volver" href="index.php?id=<?php echo $_GET['keyid'];?>">
              Volver a la Carta
              </a>&nbsp;&nbsp;
              <a class="limpiar" href="#">
              Eliminar Todo
              </a>
            </div>
          </div>  
        </div>
    </div>
  </section>
  <section>
    <div class="container contendor">
      <div class="row">
        <div class="col-lg-12">
         <h4 class="intro-title" style="text-align: center">Productos Agregados para Solicitar</h4>
        </div>
      </div>
    </div>
  </section>
  <section>
    <div class="container contendor">
      <div class="row">
        <div class="col-lg-12">
               <table class="table table-hover table-lg">
                  <thead>
                     <tr>
                        <th scope="col">Código</th>
                        <th scope="col">Producto</th>
                        <th scope="col">Precios</th>
                        <th scope="col">Acción</th>
                     </tr>
                  </thead>
                  <tbody>
                     <?php
                     $total=0;
                     foreach ($_SESSION["carrito"] as $value) 
                     {
                     ?>
                     <tr>
                        <th scope="row"><?php echo $value["id"];?></th>
                        <td><?php echo $value["nombre"];?></td>
                        <td><?php echo moneda_chilena($value["precio"]);?></td>
                        <td>
                          <a class="elim" id="<?php echo $value["posicion"];?>" href="#">
                            <svg width="2em" height="2em" viewBox="0 0 16 16" class="bi bi-trash-fill text-danger" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                              <path fill-rule="evenodd" d="M2.5 1a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1H3v9a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V4h.5a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H10a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1H2.5zm3 4a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-1 0v-7a.5.5 0 0 1 .5-.5zM8 5a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-1 0v-7A.5.5 0 0 1 8 5zm3 .5a.5.5 0 0 0-1 0v7a.5.5 0 0 0 1 0v-7z"/>
                            </svg>
                          </a>
                        </td>
                     </tr>
                     <?php
                        $total+=$value["precio"];
                     }
                     ?>
                  </tbody>
                </table>
              <div>
                <hr><br>
                <h3 class="price-tag text-center">¡¡¡Si estas listo con tu pedido, llama al garzón para solicitarlo!!!</h3>
                <!--<h3 class="price-tag">Total : <?php echo moneda_chilena($total);?></h3>-->
              </div>
        </div>
      </div>
    </div>
  </section>

  <footer class="container contendor"><br>
    <hr>
		<div class="container">
			<div class="footer-bottom row align-items-center text-center">
				<p class="footer-text m-0 col-md-12">
        Copyright 2020, Todos los Derechos reservados PNK, <br>
            Sitio desarrollado para la Explotación de Vulnerabilidades Web, Laboratorio de Programación Segura I<br><b>Área Tecnologías de Información y Ciberseguridad - Inacap Sede La Serena</b></br></br>
            <br><br>
        </p>
			</div>
		</div>
	</footer>

  <script src="vendors/jquery/jquery-3.2.1.min.js"></script>
  <script src="vendors/bootstrap/bootstrap.bundle.min.js"></script>
  <script src="vendors/owl-carousel/owl.carousel.min.js"></script>
  <script src="vendors/nice-select/jquery.nice-select.min.js"></script>
  <script src="vendors/Magnific-Popup/jquery.magnific-popup.min.js"></script>
  <script src="js/jquery.ajaxchimp.min.js"></script>
  <script src="js/main.js"></script>
  <script src="js/controladorajax.js"></script>
</body>
</html>