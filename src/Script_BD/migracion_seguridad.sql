-- ---------------------------------------------------------------------------
-- Migración de seguridad para la base pnk_security (rama mejoras)
-- Ejecutar DESPUÉS de pnk_security.sql:  mysql pnk_security < migracion_seguridad.sql
-- ---------------------------------------------------------------------------

-- VUL009: contraseñas almacenadas como hash bcrypt (password_hash de PHP).
-- Las cuentas de prueba conservan sus claves de laboratorio (admin01 / alondra01).
UPDATE `usuarios` SET `password` = '$2y$12$M46CstiJ393F602UoStMK.dcJZtFktvnqd4rWdPVfVEiGwDLWcuIW' WHERE `email` = 'admin@gmail.com';
UPDATE `usuarios` SET `password` = '$2y$12$XD81bjd3QkWexPisEMC/mOAlpemV8vIBXfNGBsPHo6oD8Ri50Ap6y' WHERE `email` = 'alondra@gmail.com';
ALTER TABLE `usuarios` ADD UNIQUE KEY `uq_usuarios_email` (`email`);

-- VUL018: registro de intentos fallidos para bloqueo temporal por IP/cuenta.
CREATE TABLE IF NOT EXISTS `login_intentos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ip` varchar(45) NOT NULL,
  `email` varchar(255) NOT NULL,
  `creado` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_login_intentos_ip` (`ip`, `creado`),
  KEY `idx_login_intentos_email` (`email`, `creado`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- VUL019: usuario de aplicación con privilegios mínimos (reemplaza a root).
-- La clave real se define al desplegar (ver deploy/user-data.sh); aquí solo
-- se documentan los permisos necesarios:
--   CREATE USER 'pnk_app'@'localhost' IDENTIFIED BY '<clave aleatoria>';
--   GRANT SELECT ON pnk_security.* TO 'pnk_app'@'localhost';
--   GRANT INSERT ON pnk_security.comentarios TO 'pnk_app'@'localhost';
--   GRANT INSERT, DELETE ON pnk_security.login_intentos TO 'pnk_app'@'localhost';
