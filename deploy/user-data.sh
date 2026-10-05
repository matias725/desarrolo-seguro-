#!/bin/bash
# ---------------------------------------------------------------------------
# Aprovisionamiento de EC2 (Ubuntu 24.04) para pnkSecurity - rama "mejoras".
# Lo ejecuta cloud-init en el primer arranque. deploy/desplegar_aws.py
# reemplaza los marcadores __DOMINIO__, __RAMA__ y __VULNERABLE__.
# Log: /var/log/pnk-deploy.log
# ---------------------------------------------------------------------------
set -euxo pipefail
# El log queda solo para root: nunca debe ser legible por www-data (VUL023).
install -m 600 /dev/null /var/log/pnk-deploy.log
exec > /var/log/pnk-deploy.log 2>&1

REPO="https://github.com/matias725/desarrolo-seguro-.git"
RAMA="__RAMA__"
DOMINIO="__DOMINIO__"
VULNERABLE="__VULNERABLE__"   # 1 = publica además la versión original en :8080 (solo para testing)
WEB=/var/www/pnk

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y apache2 php libapache2-mod-php php-mysql php-mbstring \
                   mysql-server php-cli git certbot python3-certbot-apache unattended-upgrades

# --- Código ----------------------------------------------------------------
git clone --depth 1 -b "$RAMA" "$REPO" /opt/pnk
mkdir -p "$WEB"
cp -r /opt/pnk/src/pnkSecurity/. "$WEB"/
rm -f "$WEB"/setup/config.example.php
chown -R root:www-data "$WEB"
find "$WEB" -type d -exec chmod 750 {} \;
find "$WEB" -type f -exec chmod 640 {} \;

# --- Base de datos (MySQL solo escucha en 127.0.0.1) -----------------------
mysql -e "CREATE DATABASE IF NOT EXISTS pnk_security CHARACTER SET utf8mb4 COLLATE utf8mb4_spanish_ci"
sed '1s/^\xEF\xBB\xBF//; /^CREATE DATABASE/d' /opt/pnk/src/Script_BD/pnk_security.sql | mysql pnk_security
mysql pnk_security < /opt/pnk/src/Script_BD/migracion_seguridad.sql
mysql pnk_security < /opt/pnk/src/Script_BD/migracion_seguridad_2.sql

# VUL023: las cuentas de laboratorio nunca llegan a producción con claves
# conocidas. Se generan claves aleatorias que solo root puede leer.
set +x   # no escribir secretos en el log
CRED=/root/pnk-credenciales.txt
install -m 600 /dev/null "$CRED"
for EMAIL in admin@gmail.com alondra@gmail.com; do
    CLAVE=$(openssl rand -base64 18 | tr -d '/+=')
    HASH=$(CLAVE="$CLAVE" php -r 'echo password_hash(getenv("CLAVE"), PASSWORD_BCRYPT, ["cost" => 12]);')
    mysql pnk_security -e "UPDATE usuarios SET password='${HASH}' WHERE email='${EMAIL}'"
    echo "${EMAIL}  ${CLAVE}" >> "$CRED"
done
unset CLAVE HASH
set -x

# Usuario de aplicación con privilegios mínimos y clave aleatoria (VUL019).
set +x   # no escribir secretos en el log
DB_PASS=$(openssl rand -hex 24)
mysql <<SQL
CREATE USER IF NOT EXISTS 'pnk_app'@'localhost' IDENTIFIED BY '${DB_PASS}';
GRANT SELECT ON pnk_security.* TO 'pnk_app'@'localhost';
GRANT INSERT ON pnk_security.comentarios TO 'pnk_app'@'localhost';
GRANT INSERT, DELETE ON pnk_security.login_intentos TO 'pnk_app'@'localhost';
FLUSH PRIVILEGES;
SQL

# Credenciales como variables de entorno de Apache, fuera del directorio web.
cat > /etc/apache2/pnk-secretos.conf <<CONF
SetEnv PNK_DB_HOST localhost
SetEnv PNK_DB_USER pnk_app
SetEnv PNK_DB_PASS ${DB_PASS}
SetEnv PNK_DB_NAME pnk_security
CONF
chmod 600 /etc/apache2/pnk-secretos.conf
unset DB_PASS
set -x

# --- Apache endurecido -------------------------------------------------------
a2enmod headers ssl rewrite
cat > /etc/apache2/conf-available/pnk-hardening.conf <<'CONF'
ServerTokens Prod
ServerSignature Off
TraceEnable Off
Header always unset X-Powered-By
CONF
a2enconf pnk-hardening

cat > /etc/apache2/sites-available/pnk.conf <<CONF
<VirtualHost *:80>
    ServerName ${DOMINIO}
    DocumentRoot ${WEB}
    Include /etc/apache2/pnk-secretos.conf
    <Directory ${WEB}>
        Options -Indexes -FollowSymLinks
        AllowOverride None
        Require all granted
        <FilesMatch "^(config\.local\.php|setup\.php|\.ht.*|.*\.(sql|md|bak|ini|log))$">
            Require all denied
        </FilesMatch>
    </Directory>
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-Frame-Options "DENY"
    Header always set Referrer-Policy "strict-origin-when-cross-origin"
    RedirectMatch 302 ^/$ /index.php?id=1
    ErrorLog \${APACHE_LOG_DIR}/pnk_error.log
    CustomLog \${APACHE_LOG_DIR}/pnk_access.log combined
</VirtualHost>
CONF
a2dissite 000-default
a2ensite pnk

# PHP de producción: sin errores en pantalla ni versión expuesta (VUL021/VUL022).
for ini in /etc/php/*/apache2/php.ini; do
    sed -i 's/^display_errors = .*/display_errors = Off/; s/^expose_php = .*/expose_php = Off/' "$ini"
done

# --- Versión ORIGINAL vulnerable (solo evidencia de testing, puerto 8080) ----
if [ "$VULNERABLE" = "1" ]; then
    git clone --depth 1 -b main "$REPO" /opt/pnk-original
    mkdir -p /var/www/original
    cp -r /opt/pnk-original/src/pnkSecurity/. /var/www/original/
    set +x
    VULN_PASS=$(openssl rand -hex 16)
    mysql -e "CREATE DATABASE IF NOT EXISTS pnk_original CHARACTER SET utf8mb4"
    sed '1s/^\xEF\xBB\xBF//; /^CREATE DATABASE/d' /opt/pnk-original/src/Script_BD/pnk_security.sql | mysql pnk_original
    mysql -e "CREATE USER IF NOT EXISTS 'pnk_original'@'localhost' IDENTIFIED BY '${VULN_PASS}'; GRANT ALL ON pnk_original.* TO 'pnk_original'@'localhost';"
    # Único cambio: apuntar a su propia BD (el original usa root sin clave).
    sed -i "s/mysqli_connect(\"localhost\",\"root\",\"\",\"pnk_security\")/mysqli_connect(\"localhost\",\"pnk_original\",\"${VULN_PASS}\",\"pnk_original\")/" /var/www/original/setup/setup.php
    unset VULN_PASS
    set -x
    chown -R www-data:www-data /var/www/original
    grep -q "Listen 8080" /etc/apache2/ports.conf || echo "Listen 8080" >> /etc/apache2/ports.conf
    cat > /etc/apache2/sites-available/pnk-original.conf <<'CONF'
<VirtualHost *:8080>
    DocumentRoot /var/www/original
    # Replica la configuración por defecto de XAMPP (errores visibles).
    php_admin_flag display_errors On
    php_admin_value error_reporting 22527
    <Directory /var/www/original>
        Require all granted
    </Directory>
</VirtualHost>
CONF
    a2ensite pnk-original

    # VUL027: la versión vulnerable se elimina sola a las 2 horas, aunque
    # nadie se acuerde de apagarla. Para retirarla antes:
    #   sudo systemctl start pnk-retirar-original.service
    cat > /usr/local/sbin/pnk-retirar-original <<'SH'
#!/bin/bash
a2dissite pnk-original || true
sed -i '/^Listen 8080$/d' /etc/apache2/ports.conf
rm -rf /var/www/original /opt/pnk-original
mysql -e "DROP DATABASE IF EXISTS pnk_original; DROP USER IF EXISTS 'pnk_original'@'localhost';"
systemctl reload apache2 || systemctl restart apache2
SH
    chmod 700 /usr/local/sbin/pnk-retirar-original
    cat > /etc/systemd/system/pnk-retirar-original.service <<'UNIT'
[Unit]
Description=Retira la version vulnerable de pnkSecurity (:8080)
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/pnk-retirar-original
UNIT
    cat > /etc/systemd/system/pnk-retirar-original.timer <<'UNIT'
[Unit]
Description=Retira la version vulnerable de pnkSecurity 2 horas despues del arranque
[Timer]
OnBootSec=2h
Unit=pnk-retirar-original.service
[Install]
WantedBy=timers.target
UNIT
    systemctl daemon-reload
    systemctl enable --now pnk-retirar-original.timer
fi

systemctl restart apache2

# --- HTTPS con Let's Encrypt (dominio <ip>.sslip.io) ------------------------
IP_ESPERADA=$(echo "$DOMINIO" | sed 's/\.sslip\.io$//; s/-/./g')
for i in $(seq 1 60); do
    TOKEN=$(curl -s -X PUT http://169.254.169.254/latest/api/token -H "X-aws-ec2-metadata-token-ttl-seconds: 60")
    IP_ACTUAL=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4 || true)
    [ "$IP_ACTUAL" = "$IP_ESPERADA" ] && break
    sleep 10
done
certbot --apache -d "$DOMINIO" --non-interactive --agree-tos \
        --register-unsafely-without-email --redirect \
    || echo "AVISO: no se pudo emitir el certificado; el sitio queda solo en HTTP"

echo "DESPLIEGUE-COMPLETO"
