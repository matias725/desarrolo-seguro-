# Host: localhost  (Version 8.0.17)
# Date: 2020-11-05 00:16:07
# Generator: MySQL-Front 6.0  (Build 2.20)

CREATE DATABASE `pnk_security` DEFAULT CHARACTER SET latin1 COLLATE latin1_spanish_ci;

#
# Structure for table "cartas"
#

DROP TABLE IF EXISTS `cartas`;
CREATE TABLE `cartas` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` varchar(45) COLLATE utf8_spanish_ci DEFAULT NULL COMMENT 'nombre de fantasia para la carta',
  `orden` int(11) DEFAULT NULL COMMENT 'numero de orden en que aparecera la carta a modo de lista en el menu',
  `visible` bit(1) DEFAULT b'1' COMMENT 'indica si esta visible o no en el sistema',
  `foto` varchar(200) COLLATE utf8_spanish_ci DEFAULT NULL COMMENT 'fotografia representativa de la carta',
  `creada` datetime DEFAULT CURRENT_TIMESTAMP COMMENT 'fecha en la que se creo el registro en el sistema',
  `actualizada` datetime DEFAULT NULL COMMENT 'fecha de la ultima actualizaci?n del registro en el sistema',
  `eliminada` datetime DEFAULT NULL COMMENT 'fecha en la que se elimino el registro en el sistema',
  `restautantes_id` int(11) NOT NULL COMMENT 'identificador del restaurant asociado a la carta',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8 COLLATE=utf8_spanish_ci;

#
# Data for table "cartas"
#

INSERT INTO `cartas` VALUES (1,'Vinos',1,b'1','carta2.jpg','2020-09-22 23:03:07',NULL,NULL,1),(2,'Bebidas',2,b'1','carta2.jpg','2020-09-22 23:03:07',NULL,NULL,1),(3,'Entradas',3,b'1','carta3.jpg','2020-09-22 23:06:14',NULL,NULL,1),(4,'Principales',4,b'1','carta6.jpg','2020-09-22 23:06:14',NULL,NULL,1),(5,'Postres',5,b'1','carta6.jpg','2020-09-22 23:30:22',NULL,NULL,1),(6,'Helados',9,b'1','carta6.jpg','2020-09-23 04:55:51','1899-12-29 00:00:00',NULL,1),(7,'Pizzas',6,b'1','carta7.jpg','2020-09-23 05:38:42',NULL,NULL,1),(8,'Dulces',7,b'1','carta6.jpg','2020-09-23 05:48:07',NULL,NULL,1),(10,'Vinos',1,b'1','carta10.jpg','2020-09-24 15:54:20',NULL,NULL,2),(11,'Principal',2,b'1','carta11.jpg','2020-09-26 20:20:07',NULL,NULL,2),(12,'Comiditas',2,b'1','carta12.jpg','2020-09-29 19:08:01',NULL,NULL,2);

#
# Structure for table "categorias"
#

DROP TABLE IF EXISTS `categorias`;
CREATE TABLE `categorias` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) COLLATE utf8_spanish_ci NOT NULL COMMENT 'nombre de la categoria que aparecera en la carta',
  `visible` bit(1) DEFAULT b'0' COMMENT 'indica si la categoria estara visible o no en la carta',
  `foto` varchar(200) COLLATE utf8_spanish_ci DEFAULT NULL COMMENT 'fotografia que se mostrara en la carta para representar la categoria',
  `orden` int(11) DEFAULT NULL COMMENT 'numero de orden en que aparecera la categoria a modo de lista en la carta',
  `creado` datetime DEFAULT CURRENT_TIMESTAMP COMMENT 'fecha en la que se creo el registro en el sistema',
  `actualizado` datetime DEFAULT NULL COMMENT 'fecha de la ultima actualizaci?n del registro en el sistema',
  `eliminado` datetime DEFAULT NULL COMMENT 'fecha en la que se elimino el registro en el sistema',
  `cartas_id` int(11) NOT NULL COMMENT 'identificador de la carta asociada a esta categoria',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8 COLLATE=utf8_spanish_ci;

#
# Data for table "categorias"
#

INSERT INTO `categorias` VALUES (1,'Blancos',b'1','',1,'2020-09-22 23:28:29',NULL,NULL,1),(2,'Tintos',b'1',NULL,2,'2020-09-22 23:28:29',NULL,NULL,1),(3,'Carnes',b'1',NULL,1,'2020-09-22 23:33:02',NULL,NULL,4),(4,'Pescados',b'1',NULL,2,'2020-09-22 23:33:02',NULL,NULL,4),(5,'Mariscos',b'1',NULL,3,'2020-09-22 23:33:02',NULL,NULL,4),(6,'Pastas',b'1',NULL,4,'2020-09-22 23:33:02',NULL,NULL,4),(7,'Frías',b'1',NULL,1,'2020-09-22 23:36:44',NULL,NULL,3),(8,'Calientes',b'1',NULL,2,'2020-09-22 23:36:44',NULL,NULL,3),(9,'Comida casera',b'0',NULL,NULL,'2020-09-22 23:40:40',NULL,NULL,4),(10,'Con Alcohol',b'1',NULL,NULL,'2020-09-22 23:42:52',NULL,NULL,2),(11,'Sin Alcohol',b'1',NULL,2,'2020-09-22 23:42:52','1899-12-29 00:00:00',NULL,2),(12,'Blancos',b'1',NULL,2,'2020-09-26 18:19:37',NULL,NULL,10),(13,'Tintos',b'1',NULL,1,'2020-09-26 18:19:58',NULL,NULL,10),(14,'Carnes',b'1','',1,'2020-09-26 20:21:37',NULL,NULL,11);

#
# Structure for table "comentarios"
#

DROP TABLE IF EXISTS `comentarios`;
CREATE TABLE `comentarios` (
  `Id` int(11) NOT NULL AUTO_INCREMENT,
  `usuario` varchar(255) COLLATE utf8_spanish_ci DEFAULT NULL,
  `comentario` text COLLATE utf8_spanish_ci,
  `id_restaurante` int(11) DEFAULT NULL,
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8 COLLATE=utf8_spanish_ci;

#
# Data for table "comentarios"
#


#
# Structure for table "direcciones"
#

DROP TABLE IF EXISTS `direcciones`;
CREATE TABLE `direcciones` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `calle` varchar(100) COLLATE utf8_spanish_ci NOT NULL COMMENT 'nombre de la calle',
  `numero` varchar(15) COLLATE utf8_spanish_ci NOT NULL COMMENT 'numeraci?n dentro de la calle',
  `comuna` varchar(100) COLLATE utf8_spanish_ci NOT NULL COMMENT 'comuna a la que pertenece la direcci',
  `region` varchar(100) COLLATE utf8_spanish_ci DEFAULT NULL COMMENT 'region a la que pertenece la comuna',
  `creado` datetime DEFAULT CURRENT_TIMESTAMP COMMENT 'fecha en la que se creo el registro en el sistema',
  `actualizado` datetime DEFAULT NULL COMMENT 'fecha de la ultima actualizaci?n del registro en el sistema',
  `eliminado` datetime DEFAULT NULL COMMENT 'fecha en la que se elimino el registro en el sistema',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8 COLLATE=utf8_spanish_ci;

#
# Data for table "direcciones"
#

INSERT INTO `direcciones` VALUES (1,'Los Arandanos','1550','La Serena','Coquimbo','2020-09-22 22:57:59',NULL,NULL),(2,'Avenida Argentina','951','La Serena','Coquimbo','2020-09-24 14:58:00','2020-10-04 12:14:35',NULL),(3,'Balmaceda','357','La Serena','Coquimbo','2020-09-24 14:58:00','2020-09-28 01:59:00',NULL),(4,'Peru','2255','La Serena','Coquimbo','2020-09-27 14:10:19','2020-09-28 01:58:16',NULL),(5,'Miraflores','36','Ovalle','Coquimbo','2020-09-28 15:31:09',NULL,NULL),(6,'Arrayanes','66','La Higuera','Coquimbo','2020-09-29 10:35:11',NULL,NULL),(7,'Casa','25','La Higuera','Coquimbo','2020-09-30 17:38:12',NULL,NULL),(8,'Guatemala','55','La Serena','Coquimbo','2020-10-05 04:59:40','2020-10-05 05:14:08',NULL);

#
# Structure for table "items"
#

DROP TABLE IF EXISTS `items`;
CREATE TABLE `items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) COLLATE utf8_spanish_ci NOT NULL COMMENT 'nombre del plato, postre o bebida para mostrar en carta',
  `descripcion` varchar(300) COLLATE utf8_spanish_ci DEFAULT NULL COMMENT 'descripci?n del plato, postre o bebida para mostrar en carta',
  `tiempo` varchar(100) COLLATE utf8_spanish_ci DEFAULT NULL COMMENT 'tiempo de preparaci?n del plato, postre o bebida para mostrar en carta',
  `observaciones` varchar(300) COLLATE utf8_spanish_ci DEFAULT NULL COMMENT 'informaci?n relevante del plato, postre o bebida para mostrar en carta',
  `precio` int(11) DEFAULT NULL COMMENT 'precio del plato, postre o bebida para mostrar en carta',
  `visible` bit(1) DEFAULT b'0' COMMENT 'indica si el plato, postre o bebida esta visible o no en la carta',
  `destacado` bit(1) DEFAULT b'0' COMMENT 'indica si el plato, postre o bebida aparecera como destacado en la carta',
  `puntuacion` int(11) DEFAULT '0' COMMENT 'numero que indica puntuaci?n del plato de 0 a 5',
  `foto` varchar(200) COLLATE utf8_spanish_ci DEFAULT NULL COMMENT 'fotografia del plato, postre o bebida para mostrar en carta',
  `orden` int(11) DEFAULT NULL COMMENT 'nuero de orden en el que se visualizara el plato, postre o bebida en la carta',
  `creado` datetime DEFAULT CURRENT_TIMESTAMP COMMENT 'fecha en la que se creo el registro en el sistema',
  `actualizado` datetime DEFAULT NULL COMMENT 'fecha de la ultima actualizaci?n del registro en el sistema',
  `eliminado` datetime DEFAULT NULL COMMENT 'fecha en la que se elimino el registro en el sistema',
  `categorias_id` int(11) NOT NULL COMMENT 'identificador de la categoria asociada al plato, postre o bebida',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8 COLLATE=utf8_spanish_ci;

#
# Data for table "items"
#

INSERT INTO `items` VALUES (1,'Ensalada Cesar','Ensalada con queso','15 minutos',NULL,3500,b'1',b'0',4,'item1.jpg',1,'2020-09-22 23:39:07',NULL,NULL,7),(2,'Crema de espinacas','Crema a base de espinacas y finas hierbas','20 minutos','',2000,b'1',b'1',4,'item2.jpg',2,'2020-09-22 23:39:07','2020-09-29 01:48:57',NULL,8),(3,'Porotos Granados','Porotos con verduras','25 minutos',NULL,3500,b'1',b'0',5,'item3.jpg',NULL,'2020-09-22 23:43:50',NULL,'2020-09-29 02:02:48',9),(4,'Pisco Sour','Pisco sour casero','15 minutos',NULL,3500,b'1',b'0',0,'item4.jpg',NULL,'2020-09-22 23:43:50',NULL,NULL,10),(5,'Lomo a lo Pobre','Lomo con papas fritas, huevo y cebolla','30 minutos','Muy sabroso',12500,b'1',b'1',5,'item5.jpg',1,'2020-09-29 02:12:03',NULL,NULL,3),(7,'Lomo a lo Pobre','Lomo a lo Pobre','20 minutos','Rico Lomo a lo Pobre',9900,b'1',b'1',3,'item3.jpg',2,'2020-10-05 20:30:06',NULL,NULL,3);

#
# Structure for table "restautantes"
#

DROP TABLE IF EXISTS `restautantes`;
CREATE TABLE `restautantes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `rut` varchar(11) COLLATE utf8_spanish_ci NOT NULL COMMENT 'rol unico tributario del restotant',
  `nombre` varchar(200) COLLATE utf8_spanish_ci NOT NULL COMMENT 'nombre de fantasia para el restorant',
  `fono` varchar(45) COLLATE utf8_spanish_ci NOT NULL COMMENT 'numero telefonico que aparecera en la carta',
  `mapa` varchar(200) COLLATE utf8_spanish_ci DEFAULT NULL COMMENT 'ruta del archivo o link que mostrara el mapa del restaurant',
  `foto` varchar(200) COLLATE utf8_spanish_ci DEFAULT NULL COMMENT 'fotografia del restaurant que se visualizara en la carta',
  `email` varchar(100) COLLATE utf8_spanish_ci DEFAULT NULL,
  `creado` datetime DEFAULT CURRENT_TIMESTAMP COMMENT 'fecha en la que se creo el registro en el sistema',
  `actualizado` datetime DEFAULT NULL COMMENT 'fecha de la ultima actualizaci?n del registro en el sistema',
  `eliminado` datetime DEFAULT NULL COMMENT 'fecha en la que se elimino el registro en el sistema',
  `direcciones_id` int(11) NOT NULL COMMENT 'identificador de la direcci?n que esta asociada al registro',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8 COLLATE=utf8_spanish_ci;

#
# Data for table "restautantes"
#

INSERT INTO `restautantes` VALUES (1,'99887766-5','Afríca Restobar','22334455',NULL,'resto1.jpg','mail@correo.cl','2020-09-22 22:59:26','2020-10-04 12:14:35',NULL,2),(2,'88776655-4','Restaurant la Bahía','512323232',NULL,'resto2.png','mail1@correo.cl','2020-09-24 15:07:32','2020-09-28 01:59:00',NULL,3),(3,'22334455-6','La Esquina del Sabor','22334455',NULL,'logo_empresa_comodin.png','mail2@correo.cl','2020-09-27 14:10:20','2020-09-28 01:58:16',NULL,4),(4,'258-3','La Pica de Armando','223366',NULL,'logo_empresa_comodin.png','mail3@correo.cl','2020-09-28 15:31:09',NULL,NULL,5),(5,'258-9','Donde Carlos','336699',NULL,'logo_empresa_comodin.png','mail4@correo.cl','2020-09-29 10:35:12',NULL,NULL,6),(6,'258-6','RestoPenka','336699',NULL,'logo_empresa_comodin.png','mail5@correo.cl','2020-09-30 17:38:12',NULL,NULL,7),(7,'369-5','La Pica de Carolina','336699',NULL,'logo_empresa_comodin.png','mail6@correo.cl','2020-10-05 04:59:40','2020-10-05 05:14:08',NULL,8);

#
# Structure for table "usuarios"
#

DROP TABLE IF EXISTS `usuarios`;
CREATE TABLE `usuarios` (
  `Id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` varchar(255) COLLATE utf8_spanish_ci DEFAULT NULL,
  `email` varchar(255) COLLATE utf8_spanish_ci DEFAULT NULL,
  `password` varchar(255) COLLATE utf8_spanish_ci DEFAULT NULL,
  `estado` varchar(255) COLLATE utf8_spanish_ci DEFAULT NULL,
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8 COLLATE=utf8_spanish_ci;

#
# Data for table "usuarios"
#

INSERT INTO `usuarios` VALUES (1,'Administrador','admin@gmail.com','$2y$12$M46CstiJ393F602UoStMK.dcJZtFktvnqd4rWdPVfVEiGwDLWcuIW','1'),(2,'Alondra','alondra@gmail.com','$2y$12$XD81bjd3QkWexPisEMC/mOAlpemV8vIBXfNGBsPHo6oD8Ri50Ap6y','1');
