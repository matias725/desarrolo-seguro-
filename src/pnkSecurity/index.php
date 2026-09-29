<?php

include("setup/setup.php");
session_start();

mysqli_set_charset(conectar(), 'utf8');
$key=$_GET['id'];
$_SESSION['id']=$_GET['id'];

$sql_restorant="SELECT direcciones.calle, direcciones.numero, direcciones.comuna, direcciones.region, restautantes.nombre, restautantes.id, restautantes.fono, restautantes.email, restautantes.foto FROM restautantes INNER JOIN direcciones ON restautantes.direcciones_id =
direcciones.id WHERE restautantes.id = ".$key." AND restautantes.eliminado IS NULL";
$result_restorant=mysqli_query(conectar(),$sql_restorant);
$datos_restorant=mysqli_fetch_array($result_restorant);



?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="ie=edge">
  <title><?php echo utf8_encode($datos_restorant['nombre']);?></title>
	<!--<link rel="icon" href="img/Fevicon.png" type="image/png">-->

  <link rel="stylesheet" href="vendors/bootstrap/bootstrap.min.css">
  <link rel="stylesheet" href="vendors/themify-icons/themify-icons.css">
  <link rel="stylesheet" href="vendors/owl-carousel/owl.theme.default.min.css">
  <link rel="stylesheet" href="vendors/owl-carousel/owl.carousel.min.css">

  <link rel="stylesheet" href="css/style.css">
</head>
<body>
<nav class="navbar navbar-light bg-light">
   <?php
    if(!isset($_SESSION['nombre']))
    {
    ?>
      <form class="form-inline" role="search" action="setup/procesalogin.php" method="post">
        <div class="form-group">
          <div class="input-group-prepend">
            <span class="input-group-text" id="basic-addon1">@</span>
          </div>
            <input type="text" class="form-control" name="frmusuario" placeholder="Usuario">
        </div>
        <div class="form-group">
            <input type="password" class="form-control" name="frmpassword" placeholder="Contraseña">
        </div>
        <button type="submit" class="btn btn-outline-primary my-2 my-sm-0">Ingresar</button>
      </form>
    <?php
    }else{
      echo "Bienvenido :".$_SESSION['nombre']." - <a href=setup/cerrar_sesion.php>Cerra Sesión</a>";
    }
  ?>
</nav>
  <section>
    <div class="container contendor">
      <div class="row">
        <div class="col-lg-4">
          <div style="text-align: center;">
            <div class="media">
              <img class="logosintituciones" src="img/logo.png" width="190px" alt="">
            </div>
          </div>  
        </div>
        <div class="col-lg-4">
          <div style="text-align: center;">
            <div class="media">
              <?php
              if($datos_restorant['foto']!="")
              {  
                ?>
                  <img class="logosintituciones" src="imagenes/cod<?php echo $key;?>/<?php echo $datos_restorant['foto'];?>" width="170px" alt="">
              <?php
              }else{
                ?>
                  <img class="logosintituciones" src="img/logo_empresa_comodin.png" width="170px" alt="">
                <?php
              }
              ?>
            </div>
          </div>  
        </div>
        <div class="col-lg-4">
          <div class="carro">
            <div class="media float-right">
              <a class="button_carrito" href="mostrar_carrito.php?keyid=<?php echo $_GET['id'];?>">
              <svg width="2em" height="2em" viewBox="0 0 16 16" class="bi bi-cart4" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path fill-rule="evenodd" d="M0 2.5A.5.5 0 0 1 .5 2H2a.5.5 0 0 1 .485.379L2.89 4H14.5a.5.5 0 0 1 .485.621l-1.5 6A.5.5 0 0 1 13 11H4a.5.5 0 0 1-.485-.379L1.61 3H.5a.5.5 0 0 1-.5-.5zM3.14 5l.5 2H5V5H3.14zM6 5v2h2V5H6zm3 0v2h2V5H9zm3 0v2h1.36l.5-2H12zm1.11 3H12v2h.61l.5-2zM11 8H9v2h2V8zM8 8H6v2h2V8zM5 8H3.89l.5 2H5V8zm0 5a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm-2 1a2 2 0 1 1 4 0 2 2 0 0 1-4 0zm9-1a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm-2 1a2 2 0 1 1 4 0 2 2 0 0 1-4 0z"/>
              </svg>
              Productos Seleccionados
              </a>
            </div>
          </div>  
        </div>
      </div>
      <div class="row">
        <div class="col-lg-12">
            <div class="text-center">
            <?php
               if($key!="")
               {
                 ?>
               
              <h4><?php echo utf8_encode($datos_restorant['nombre']);?></h4>
              <h5>
                <svg width="1em" height="1em" viewBox="0 0 16 16" class="bi bi-geo-alt" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <path fill-rule="evenodd" d="M12.166 8.94C12.696 7.867 13 6.862 13 6A5 5 0 0 0 3 6c0 .862.305 1.867.834 2.94.524 1.062 1.234 2.12 1.96 3.07A31.481 31.481 0 0 0 8 14.58l.208-.22a31.493 31.493 0 0 0 1.998-2.35c.726-.95 1.436-2.008 1.96-3.07zM8 16s6-5.686 6-10A6 6 0 0 0 2 6c0 4.314 6 10 6 10z"/>
                  <path fill-rule="evenodd" d="M8 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 1a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>
                </svg>  
              <?php echo utf8_encode($datos_restorant['calle'])." #".$datos_restorant['numero'].", ".utf8_encode($datos_restorant['comuna']);?>
              </h5>
              <?php
               }
               ?>
              <h5>
              <?php 
              if(!$datos_restorant['fono']=="")
              {
                ?>
                <svg width="1em" height="1em" viewBox="0 0 16 16" class="bi bi-telephone-fill" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <path fill-rule="evenodd" d="M2.267.98a1.636 1.636 0 0 1 2.448.152l1.681 2.162c.309.396.418.913.296 1.4l-.513 2.053a.636.636 0 0 0 .167.604L8.65 9.654a.636.636 0 0 0 .604.167l2.052-.513a1.636 1.636 0 0 1 1.401.296l2.162 1.681c.777.604.849 1.753.153 2.448l-.97.97c-.693.693-1.73.998-2.697.658a17.47 17.47 0 0 1-6.571-4.144A17.47 17.47 0 0 1 .639 4.646c-.34-.967-.035-2.004.658-2.698l.97-.969z"/>
                </svg>  
                <?php echo $datos_restorant['fono'];?>
              <?php
              }
              if(!$datos_restorant['email']=="")
              {
                ?>
                <svg width="1em" height="1em" viewBox="0 0 16 16" class="bi bi-envelope-fill" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <path fill-rule="evenodd" d="M.05 3.555A2 2 0 0 1 2 2h12a2 2 0 0 1 1.95 1.555L8 8.414.05 3.555zM0 4.697v7.104l5.803-3.558L0 4.697zM6.761 8.83l-6.57 4.027A2 2 0 0 0 2 14h12a2 2 0 0 0 1.808-1.144l-6.57-4.027L8 9.586l-1.239-.757zm3.436-.586L16 11.801V4.697l-5.803 3.546z"/>
                </svg>
                <?php echo $datos_restorant['email'];?>
                <?php
              }
              ?>
            </h5>
            </div>
        </div>
      </div>
    </div>
  </section>
  <!--DESTACADOS-->
  <?php
  $sql="SELECT items.id,items.visible,items.tiempo,items.puntuacion,items.destacado, items.precio, items.descripcion,items.observaciones, items.nombre, items.foto, items.orden, cartas.restautantes_id, categorias.visible FROM categorias INNER JOIN items ON items.categorias_id = categorias.id INNER JOIN cartas ON categorias.cartas_id = cartas.id
  WHERE items.destacado = 1 AND items.eliminado IS NULL AND items.visible=1 AND cartas.restautantes_id = ".$key." AND cartas.eliminada IS NULL AND categorias.visible = 1 AND categorias.eliminado IS NULL";
  $result=mysqli_query(conectar(),$sql);
  $cont_destacados=mysqli_num_rows($result);
  if( $cont_destacados!=0)
  {
  ?>
  <section class="destacados">
    <div class="container contendor">
      <div class="section-intro">
        <h4 class="intro-title">Menús Destacados</h4>
      </div>
      <div class="owl-carousel owl-theme featured-carousel">
      <?php
      while($destacados=mysqli_fetch_array($result))
      {
      ?>
        <div class="featured-item">
        <?php
              if($destacados['foto']!="")
              {  
                ?>
                  <img class="card-img rounded-0" width="350px" height="235px" src="imagenes/cod<?php echo $key;?>/<?php echo $destacados['foto'];?>" alt="">
              <?php
              }else{
                ?>
                  <img class="card-img rounded-0" src="img/carta_comodin.png" width="350px" height="235px" alt="">
                <?php
              }
              ?>
          <div class="item-body">
              <h3><?php echo utf8_encode($destacados['nombre']);?></h3>
            <p><?php echo utf8_encode($destacados['descripcion']);?><br>
            <?php echo utf8_encode($destacados['observaciones']);?><br>
            <?php
            if($destacados['tiempo']!="")
            {
              ?>

            <svg width="1em" height="1em" viewBox="0 0 16 16" class="bi bi-alarm" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <path fill-rule="evenodd" d="M6.5 0a.5.5 0 0 0 0 1H7v1.07a7.001 7.001 0 0 0-3.273 12.474l-.602.602a.5.5 0 0 0 .707.708l.746-.746A6.97 6.97 0 0 0 8 16a6.97 6.97 0 0 0 3.422-.892l.746.746a.5.5 0 0 0 .707-.708l-.601-.602A7.001 7.001 0 0 0 9 2.07V1h.5a.5.5 0 0 0 0-1h-3zm1.038 3.018a6.093 6.093 0 0 1 .924 0 6 6 0 1 1-.924 0zM8.5 5.5a.5.5 0 0 0-1 0v3.362l-1.429 2.38a.5.5 0 1 0 .858.515l1.5-2.5A.5.5 0 0 0 8.5 9V5.5zM0 3.5c0 .753.333 1.429.86 1.887A8.035 8.035 0 0 1 4.387 1.86 2.5 2.5 0 0 0 0 3.5zM13.5 1c-.753 0-1.429.333-1.887.86a8.035 8.035 0 0 1 3.527 3.527A2.5 2.5 0 0 0 13.5 1z"/>
                </svg>
                <?php echo " ".$destacados['tiempo'];?>
            <?php
            }
            ?>
            </p>
            <div class="d-flex justify-content-between">
              <ul class="rating-star">
                <?php
                for($i=1;$i<=$destacados['puntuacion'];$i++)
                {
                  ?>
                    <li><i class="ti-star"></i></li>
                <?php
                }
                ?>
              </ul>
              <h3 class="price-tag"><?php             
              echo moneda_chilena($destacados['precio']);?></h3>
            </div>
            <a class="button" href="#" id="<?php echo $destacados['id'];?>" style="margin:0%">Seleccionar</a>
          </div>
        </div>
      <?php
      }
      ?>
      </div>
    </div>
  </section>
<?php
  }
?>
<section>
    <div class="container contendor">
       <div class="container">
              <div class="row">
                <div class="col-lg-12">
                  <nav>
                    <div class="nav nav-tabs nav-fill" id="nav-tab" role="tablist">
                        <?php
                            $sqlcartas="SELECT cartas.id,cartas.restautantes_id,cartas.nombre,cartas.orden,cartas.visible FROM cartas WHERE cartas.restautantes_id = ".$key." and visible=1 AND eliminada IS NULL order by orden asc";
                            $resultcartas=mysqli_query(conectar(),$sqlcartas);
                            $arraycartas=[];
                            while($cartas=mysqli_fetch_array($resultcartas))
                            {
                              array_push($arraycartas,['nombre'=>utf8_encode(quitarespacios($cartas['nombre'])),'id'=>$cartas['id']]);
                            ?>
                              <a class="nav-item nav-link" id="nav-<?php echo quitarespacios(utf8_encode($cartas['nombre']));?>-tab" data-toggle="tab" href="#<?php echo quitarespacios(utf8_encode($cartas['nombre']));?>" role="tab" aria-controls="nav-profile" aria-selected="false"><?php echo utf8_encode($cartas['nombre']);?></a>
                            <?php
                            }
                        ?>
                    </div>
                  </nav>
                  <div class="tab-content py-3 px-3 px-sm-0" id="nav-tabContent">
                    <?php
                     for($i=0;$i<=sizeof($arraycartas);$i++)
                     {                             
                    ?>
                    <div class="tab-pane fade <?php if($i==0){?>show active<?php } ?>" id="<?php echo quitarespacios($arraycartas[$i]["nombre"]);?>" role="tabpanel" aria-labelledby="nav-<?php echo quitarespacios($arraycartas[$i]["nombre"]);?>-tab">              
                      <?php
                          $sql_categorias="select id,nombre from categorias where visible=1 and cartas_id='".$arraycartas[$i]["id"]."' AND eliminado IS NULL order by orden asc";
                          $result_categorias=mysqli_query(conectar(),$sql_categorias);
                          $cont_categorias=mysqli_num_rows($result_categorias);
                          if($cont_categorias==0)
                          {?>
                              <div class="row">
                                <div class="col-lg-12">
                                  <div class="text-center">
                                    <h4>No hay información para Mostrar</h4>
                                  </div>
                                </div>
                              </div>
                          <?php
                          }else{
                              while($datos_categorias=mysqli_fetch_array($result_categorias))
                              {
                              ?>
                                <div class="section-intro mb-20px">
                                    <h4 class="intro-title"><?php echo utf8_encode($datos_categorias['nombre']);?></h4>
                                </div>

                                <div class="row">
                                  <?php
                                      $sql_items="SELECT items.visible,items.id, items.nombre, items.descripcion,items.observaciones,items.tiempo,items.puntuacion, items.precio, items.visible, items.foto, items.orden, items.categorias_id FROM items WHERE items.categorias_id = ".$datos_categorias['id']." AND items.visible=1 AND eliminado IS NULL order by orden asc";
                                      $result_items=mysqli_query(conectar(),$sql_items);
                                      $count_items=mysqli_num_rows($result_items);
                                      if($count_items!=0)
                                      {
                                            while($datos_items=mysqli_fetch_array($result_items))
                                            {
                                            ?>
                                            <div class="<?php if($count_items>1){ ?>col-lg-6 <?php }else{ ?>col-lg-12<?php } ?>">
                                              <div class="media align-items-center food-card">
                                                <?php
                                                if($datos_items['foto']=="")
                                                {
                                                ?>
                                                <img class="mr-3 mr-sm-4" src="img/carta_comodin.png" alt="" width="120px">
                                                <?php
                                                }else{
                                                  ?>
                                                <img class="mr-3 mr-sm-4" src="imagenes/cod<?php echo $key;?>/<?php echo $datos_items['foto'];?>" alt="" width="120px">
                                                  <?php
                                                }
                                                ?>
                                                <div class="media-body">
                                                  <div class="d-flex justify-content-between food-card-title">
                                                    <h4><?php echo utf8_encode($datos_items['nombre']);?></h4>
                                                    <h3 class="price-tag"><?php echo moneda_chilena($datos_items['precio']);?></h3>
                                                  </div>
                                                  <p><?php echo utf8_encode($datos_items['descripcion']);?></br>
                                                  <?php echo utf8_encode($datos_items['observaciones']);?></p>
                                                  <?php
                                                  if($datos_items['tiempo']!="")
                                                  {
                                                    ?>
                                                  <p><svg width="1em" height="1em" viewBox="0 0 16 16" class="bi bi-alarm" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                                                      <path fill-rule="evenodd" d="M6.5 0a.5.5 0 0 0 0 1H7v1.07a7.001 7.001 0 0 0-3.273 12.474l-.602.602a.5.5 0 0 0 .707.708l.746-.746A6.97 6.97 0 0 0 8 16a6.97 6.97 0 0 0 3.422-.892l.746.746a.5.5 0 0 0 .707-.708l-.601-.602A7.001 7.001 0 0 0 9 2.07V1h.5a.5.5 0 0 0 0-1h-3zm1.038 3.018a6.093 6.093 0 0 1 .924 0 6 6 0 1 1-.924 0zM8.5 5.5a.5.5 0 0 0-1 0v3.362l-1.429 2.38a.5.5 0 1 0 .858.515l1.5-2.5A.5.5 0 0 0 8.5 9V5.5zM0 3.5c0 .753.333 1.429.86 1.887A8.035 8.035 0 0 1 4.387 1.86 2.5 2.5 0 0 0 0 3.5zM13.5 1c-.753 0-1.429.333-1.887.86a8.035 8.035 0 0 1 3.527 3.527A2.5 2.5 0 0 0 13.5 1z"/>
                                                      </svg>
                                                      <?php echo " ".$datos_items['tiempo'];?></p>
                                                  <?php
                                                  }
                                                  ?>
                                                      <p>
                                                        <ul class="rating-star">
                                                          <?php
                                                          for($k=1;$k<=$datos_items['puntuacion'];$k++)
                                                          {
                                                            ?>
                                                              <li><i class="ti-star"></i></li>
                                                          <?php
                                                          }
                                                          ?>
                                                        </u>
                                                      </p>
                                                  <a class="button float-right" href="#" id="<?php echo $datos_items['id'];?>">Seleccionar</a>
                                                </div>
                                              </div>
                                            </div>
                                      <?php
                                            }
                                      }
                                      else
                                      {
                                      ?>
                                        <div class="col-lg-12 ">
                                          <div class="text-center">
                                                <h4>No Información para Mostrar</h4>
                                          </div>
                                        </div>
                                      <?php 
                                        }   
                                      ?>
                                </div>
                                <?php
                              }
                            }
                      ?>
                    </div>
                    <?php
                     }
                     ?>
                  </div>     
                </div>
              </div>
        </div>
    </div>
</section>
<div id="myModal" class="modal fade" id="exampleModal" tabindex="-1" role="dialog" aria-labelledby="exampleModalLabel" aria-hidden="true">
  <div class="modal-dialog" role="document">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title text-lg-center" id="exampleModalLabel">Selección de Producto</h5>
        <button type="button" class="close" data-dismiss="modal" aria-label="Close">
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      <div class="modal-body">
        El producto seleccionado, ha sido agregado sin problemas!!!
      </div>
    </div>
  </div>
</div>


<?php

if(isset($key))
{
?>
<section>
  <div class="container contendor">
    <div class="container">
      <div class="row">
        <div class="col-lg-12">
          <div class="section-intro">
            <h4 class="intro-title">Comentarios</h4>
             <?php
            if(isset($_SESSION['nombre']))
            {
             ?>
             <form action="grcomentarios.php" method="post">
              <div class="form-group">
                <label for="usr">Nombre:</label>
                <input type="text" class="form-control" id="usuario" name="usuario" value="<?php echo $_SESSION['nombre'];?>">
              </div>
              <div class="form-group">
                <label for="comment">Comentario:</label>
                <textarea class="form-control" rows="5" id="comentario" name="comentario"></textarea>
              </div>
              <button type="submit" class="btn btn-success fa-align-right">Comentar</button>
           </form>
           <?php
            }
          ?>
          </div>
          <br>
          <?php

            $sqlcomentarios="select * from comentarios where id_restaurante=".$key;
            $resultcomentarios=mysqli_query(conectar(),$sqlcomentarios);
            while($datoscomentarios=mysqli_fetch_array($resultcomentarios))
            {
          ?>
          <div class="card bg-light">
            <div class="card-body">
              <b><?php echo $datoscomentarios['usuario'];?></b>
              <br>
              <?php echo $datoscomentarios['comentario'];?>
            </div>
          </div>
          <br>
          <?php
            }
          ?>
          <hr>
        </div>
      </div>
    </div>
  </div>
  </section>
<?php
}
?>

  <footer class="footer-area section-gap"><br>
		<div class="container">
			<div class="footer-bottom row align-items-center text-center">
				<p class="footer-text m-0 col-md-12">
            Copyright 2020, Todos los Derechos reservados PNK, <br>
            Sitio desarrollado para la Explotación de Vulnerabilidades Web, Laboratorio de Programación Segura I<br><b>Área Tecnologías de Información y Ciberseguridad - Inacap Sede La Serena</b></br></br>
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