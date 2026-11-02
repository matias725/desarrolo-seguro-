-- =============================================================
-- Carta Digital — Datos de ejemplo (migrados desde pnk_security.sql)
-- No se incluyen usuarios: el original guardaba contraseñas en texto
-- plano. Los usuarios se crean con:  npm run crear-usuario
-- =============================================================

INSERT INTO direcciones (id, calle, numero, comuna, region, creado, actualizado) VALUES
 (1,'Los Arandanos','1550','La Serena','Coquimbo','2020-09-22 22:57:59',NULL),
 (2,'Avenida Argentina','951','La Serena','Coquimbo','2020-09-24 14:58:00','2020-10-04 12:14:35'),
 (3,'Balmaceda','357','La Serena','Coquimbo','2020-09-24 14:58:00','2020-09-28 01:59:00'),
 (4,'Peru','2255','La Serena','Coquimbo','2020-09-27 14:10:19','2020-09-28 01:58:16'),
 (5,'Miraflores','36','Ovalle','Coquimbo','2020-09-28 15:31:09',NULL),
 (6,'Arrayanes','66','La Higuera','Coquimbo','2020-09-29 10:35:11',NULL),
 (7,'Casa','25','La Higuera','Coquimbo','2020-09-30 17:38:12',NULL),
 (8,'Guatemala','55','La Serena','Coquimbo','2020-10-05 04:59:40','2020-10-05 05:14:08');

-- resto2.png del original no existe en las imágenes; se usa resto2.jpg.
-- Los logos "comodín" se dejan en NULL y la vista muestra el logo genérico.
INSERT INTO restaurantes (id, rut, nombre, fono, foto, email, creado, actualizado, direcciones_id) VALUES
 (1,'99887766-5','Afríca Restobar','22334455','resto1.jpg','mail@correo.cl','2020-09-22 22:59:26','2020-10-04 12:14:35',2),
 (2,'88776655-4','Restaurant la Bahía','512323232','resto2.jpg','mail1@correo.cl','2020-09-24 15:07:32','2020-09-28 01:59:00',3),
 (3,'22334455-6','La Esquina del Sabor','22334455',NULL,'mail2@correo.cl','2020-09-27 14:10:20','2020-09-28 01:58:16',4),
 (4,'258-3','La Pica de Armando','223366',NULL,'mail3@correo.cl','2020-09-28 15:31:09',NULL,5),
 (5,'258-9','Donde Carlos','336699',NULL,'mail4@correo.cl','2020-09-29 10:35:12',NULL,6),
 (6,'258-6','RestoPenka','336699',NULL,'mail5@correo.cl','2020-09-30 17:38:12',NULL,7),
 (7,'369-5','La Pica de Carolina','336699',NULL,'mail6@correo.cl','2020-10-05 04:59:40','2020-10-05 05:14:08',8);

INSERT INTO cartas (id, nombre, orden, visible, foto, creada, restaurantes_id) VALUES
 (1,'Vinos',1,TRUE,'carta2.jpg','2020-09-22 23:03:07',1),
 (2,'Bebidas',2,TRUE,'carta2.jpg','2020-09-22 23:03:07',1),
 (3,'Entradas',3,TRUE,'carta3.jpg','2020-09-22 23:06:14',1),
 (4,'Principales',4,TRUE,'carta6.jpg','2020-09-22 23:06:14',1),
 (5,'Postres',5,TRUE,'carta6.jpg','2020-09-22 23:30:22',1),
 (6,'Helados',9,TRUE,'carta6.jpg','2020-09-23 04:55:51',1),
 (7,'Pizzas',6,TRUE,'carta7.jpg','2020-09-23 05:38:42',1),
 (8,'Dulces',7,TRUE,'carta6.jpg','2020-09-23 05:48:07',1),
 (10,'Vinos',1,TRUE,'carta10.jpg','2020-09-24 15:54:20',2),
 (11,'Principal',2,TRUE,'carta11.jpg','2020-09-26 20:20:07',2),
 (12,'Comiditas',2,TRUE,'carta12.jpg','2020-09-29 19:08:01',2);

INSERT INTO categorias (id, nombre, visible, orden, creado, cartas_id) VALUES
 (1,'Blancos',TRUE,1,'2020-09-22 23:28:29',1),
 (2,'Tintos',TRUE,2,'2020-09-22 23:28:29',1),
 (3,'Carnes',TRUE,1,'2020-09-22 23:33:02',4),
 (4,'Pescados',TRUE,2,'2020-09-22 23:33:02',4),
 (5,'Mariscos',TRUE,3,'2020-09-22 23:33:02',4),
 (6,'Pastas',TRUE,4,'2020-09-22 23:33:02',4),
 (7,'Frías',TRUE,1,'2020-09-22 23:36:44',3),
 (8,'Calientes',TRUE,2,'2020-09-22 23:36:44',3),
 (9,'Comida casera',FALSE,NULL,'2020-09-22 23:40:40',4),
 (10,'Con Alcohol',TRUE,NULL,'2020-09-22 23:42:52',2),
 (11,'Sin Alcohol',TRUE,2,'2020-09-22 23:42:52',2),
 (12,'Blancos',TRUE,2,'2020-09-26 18:19:37',10),
 (13,'Tintos',TRUE,1,'2020-09-26 18:19:58',10),
 (14,'Carnes',TRUE,1,'2020-09-26 20:21:37',11);

INSERT INTO items (id, nombre, descripcion, tiempo, observaciones, precio, visible, destacado, puntuacion, foto, orden, creado, actualizado, eliminado, categorias_id) VALUES
 (1,'Ensalada Cesar','Ensalada con queso','15 minutos',NULL,3500,TRUE,FALSE,4,'item1.jpg',1,'2020-09-22 23:39:07',NULL,NULL,7),
 (2,'Crema de espinacas','Crema a base de espinacas y finas hierbas','20 minutos',NULL,2000,TRUE,TRUE,4,'item2.jpg',2,'2020-09-22 23:39:07','2020-09-29 01:48:57',NULL,8),
 (3,'Porotos Granados','Porotos con verduras','25 minutos',NULL,3500,TRUE,FALSE,5,'item3.jpg',NULL,'2020-09-22 23:43:50',NULL,'2020-09-29 02:02:48',9),
 (4,'Pisco Sour','Pisco sour casero','15 minutos',NULL,3500,TRUE,FALSE,0,'item4.jpg',NULL,'2020-09-22 23:43:50',NULL,NULL,10),
 (5,'Lomo a lo Pobre','Lomo con papas fritas, huevo y cebolla','30 minutos','Muy sabroso',12500,TRUE,TRUE,5,'item5.jpg',1,'2020-09-29 02:12:03',NULL,NULL,3),
 (7,'Lomo a lo Pobre','Lomo a lo Pobre','20 minutos','Rico Lomo a lo Pobre',9900,TRUE,TRUE,3,'item3.jpg',2,'2020-10-05 20:30:06',NULL,NULL,3);

-- Ajustar las secuencias tras insertar con ids explícitos
SELECT setval('direcciones_id_seq',  (SELECT MAX(id) FROM direcciones));
SELECT setval('restaurantes_id_seq', (SELECT MAX(id) FROM restaurantes));
SELECT setval('cartas_id_seq',       (SELECT MAX(id) FROM cartas));
SELECT setval('categorias_id_seq',   (SELECT MAX(id) FROM categorias));
SELECT setval('items_id_seq',        (SELECT MAX(id) FROM items));
