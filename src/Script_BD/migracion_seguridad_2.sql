-- ---------------------------------------------------------------------------
-- Migración de seguridad 2 (rama mejoras)
-- Ejecutar DESPUÉS de migracion_seguridad.sql:
--   mysql pnk_security < migracion_seguridad_2.sql
-- ---------------------------------------------------------------------------

-- VUL026: para limitar la cantidad de comentarios por usuario se registra
-- quién comentó (id de usuario) y cuándo.
ALTER TABLE `comentarios`
  ADD COLUMN `usuario_id` int NULL AFTER `usuario`,
  ADD COLUMN `creado` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER `id_restaurante`,
  ADD KEY `idx_comentarios_usuario` (`usuario_id`, `creado`),
  ADD KEY `idx_comentarios_restaurante` (`id_restaurante`, `Id`);
