<?php
/*
 * Plantilla de configuración para entornos locales (XAMPP/WAMP).
 * Copiar como setup/config.local.php (ignorado por Git) y completar.
 * En producción (AWS) las credenciales se entregan con variables de entorno
 * (SetEnv en la configuración de Apache, fuera del directorio web).
 * Usar un usuario de BD con privilegios mínimos, nunca "root".
 */
return [
    'PNK_DB_HOST' => 'localhost',
    'PNK_DB_USER' => 'pnk_app',
    'PNK_DB_PASS' => 'cambiar-por-una-clave-segura',
    'PNK_DB_NAME' => 'pnk_security',
];
