#!/bin/bash
# ---------------------------------------------------------------------------
# Laboratorio local reproducible (sin AWS).
#
# Levanta DOS instancias de la aplicacion en el mismo PC para comparar:
#   - ORIGINAL  (rama main,    vulnerable) en http://127.0.0.1:8080
#   - CORREGIDA (rama mejoras, segura)     en http://127.0.0.1:8000
#
# Cada una usa su propia base de datos MariaDB aislada, de modo que el
# testing comparativo se puede repetir sin tocar el XAMPP del equipo ni AWS.
#
# Requisitos: XAMPP (PHP 8 + MariaDB), Git Bash. Ejecutar desde la raiz del repo:
#   bash tests/lab_local.sh up      # crea BDs, carga datos y arranca los servidores
#   python tests/test_seguridad.py --vulnerable http://127.0.0.1:8080 --corregida http://127.0.0.1:8000
#   bash tests/lab_local.sh down    # detiene los servidores
#
# La clave aleatoria de la cuenta de prueba queda en:  .lab/credenciales_lab.txt
# ---------------------------------------------------------------------------
set -euo pipefail

XAMPP=${XAMPP:-/c/xampp}
PHP="$XAMPP/php/php.exe"
# XAMPP a veces trae un segundo build de PHP con las extensiones sueltas.
[ -x "$XAMPP/php/windowsXamppPhp/php.exe" ] && PHP="$XAMPP/php/windowsXamppPhp/php.exe"
EXTDIR=$(dirname "$PHP")/ext
MYSQLD="$XAMPP/mysql/bin/mysqld.exe"
MYSQL="$XAMPP/mysql/bin/mysql.exe"
INSTALL="$XAMPP/mysql/bin/mysql_install_db.exe"

LAB="$(pwd)/.lab"
PA=3399; PB=3398          # puertos MariaDB (original / corregida)
WA=8080; WB=8000          # puertos web    (original / corregida)
PHPOPTS="-n -d extension_dir=$(cygpath -w "$EXTDIR") -d extension=mysqli -d extension=mbstring -d date.timezone=America/Santiago"

up() {
  mkdir -p "$LAB"
  echo ">> Exportando codigo de main (original) y mejoras (corregida)..."
  rm -rf "$LAB/original" "$LAB/corregida"; mkdir -p "$LAB/original" "$LAB/corregida"
  git archive main   src | tar -x -C "$LAB/original"
  git archive mejoras src | tar -x -C "$LAB/corregida"

  echo ">> Creando bases de datos aisladas..."
  rm -rf "$LAB/dbA" "$LAB/dbB"
  "$INSTALL" --datadir="$(cygpath -w "$LAB/dbA")" --password= >/dev/null
  "$INSTALL" --datadir="$(cygpath -w "$LAB/dbB")" --password= >/dev/null
  "$MYSQLD" --datadir="$(cygpath -w "$LAB/dbA")" --port=$PA --bind-address=127.0.0.1 --skip-name-resolve --console >"$LAB/dbA.log" 2>&1 &
  echo $! > "$LAB/dbA.pid"
  "$MYSQLD" --datadir="$(cygpath -w "$LAB/dbB")" --port=$PB --bind-address=127.0.0.1 --skip-name-resolve --console >"$LAB/dbB.log" 2>&1 &
  echo $! > "$LAB/dbB.pid"
  for i in $(seq 1 30); do
    "$MYSQL" -h127.0.0.1 -P$PA -uroot -e "SELECT 1" >/dev/null 2>&1 && \
    "$MYSQL" -h127.0.0.1 -P$PB -uroot -e "SELECT 1" >/dev/null 2>&1 && break
    sleep 1
  done

  echo ">> Cargando datos..."
  "$MYSQL" -h127.0.0.1 -P$PA -uroot -e "CREATE DATABASE pnk_security CHARACTER SET utf8mb4 COLLATE utf8mb4_spanish_ci"
  sed '1s/^\xEF\xBB\xBF//; /^CREATE DATABASE/d' "$LAB/original/src/Script_BD/pnk_security.sql" | "$MYSQL" -h127.0.0.1 -P$PA -uroot pnk_security
  "$MYSQL" -h127.0.0.1 -P$PB -uroot -e "CREATE DATABASE pnk_security CHARACTER SET utf8mb4 COLLATE utf8mb4_spanish_ci"
  sed '1s/^\xEF\xBB\xBF//; /^CREATE DATABASE/d' "$LAB/corregida/src/Script_BD/pnk_security.sql" | "$MYSQL" -h127.0.0.1 -P$PB -uroot pnk_security
  "$MYSQL" -h127.0.0.1 -P$PB -uroot pnk_security < "$LAB/corregida/src/Script_BD/migracion_seguridad.sql"
  "$MYSQL" -h127.0.0.1 -P$PB -uroot pnk_security < "$LAB/corregida/src/Script_BD/migracion_seguridad_2.sql"

  echo ">> Configurando la version corregida (usuario minimo + clave aleatoria, como en AWS)..."
  DBP=$("$PHP" $PHPOPTS -r 'echo bin2hex(random_bytes(24));')
  CLAVE=$("$PHP" $PHPOPTS -r 'echo rtrim(strtr(base64_encode(random_bytes(12)),"+/","Ab"),"=");')
  HASH=$(CLAVE="$CLAVE" "$PHP" $PHPOPTS -r 'echo password_hash(getenv("CLAVE"), PASSWORD_BCRYPT, ["cost"=>12]);')
  HADM=$("$PHP" $PHPOPTS -r 'echo password_hash(bin2hex(random_bytes(16)), PASSWORD_BCRYPT, ["cost"=>12]);')
  "$MYSQL" -h127.0.0.1 -P$PB -uroot pnk_security -e "
    UPDATE usuarios SET password='$HASH' WHERE email='alondra@gmail.com';
    UPDATE usuarios SET password='$HADM' WHERE email='admin@gmail.com';
    CREATE USER 'pnk_app'@'127.0.0.1' IDENTIFIED BY '$DBP';
    GRANT SELECT ON pnk_security.* TO 'pnk_app'@'127.0.0.1';
    GRANT INSERT ON pnk_security.comentarios TO 'pnk_app'@'127.0.0.1';
    GRANT INSERT, DELETE ON pnk_security.login_intentos TO 'pnk_app'@'127.0.0.1';
    FLUSH PRIVILEGES;"
  cat > "$LAB/corregida/src/pnkSecurity/setup/config.local.php" <<EOF
<?php
return [
    'PNK_DB_HOST' => '127.0.0.1',
    'PNK_DB_USER' => 'pnk_app',
    'PNK_DB_PASS' => '$DBP',
    'PNK_DB_NAME' => 'pnk_security',
];
EOF
  printf 'alondra@gmail.com  %s\n' "$CLAVE" > "$LAB/credenciales_lab.txt"

  echo ">> Arrancando servidores web..."
  "$PHP" $PHPOPTS -d mysqli.default_port=$PA -d display_errors=On  -d error_reporting=32767 \
      -S 127.0.0.1:$WA -t "$(cygpath -w "$LAB/original/src/pnkSecurity")"  >"$LAB/web_original.log"  2>&1 &
  echo $! > "$LAB/webA.pid"
  "$PHP" $PHPOPTS -d mysqli.default_port=$PB -d display_errors=Off -d log_errors=On \
      -S 127.0.0.1:$WB -t "$(cygpath -w "$LAB/corregida/src/pnkSecurity")" >"$LAB/web_corregida.log" 2>&1 &
  echo $! > "$LAB/webB.pid"
  sleep 2
  echo
  echo "   ORIGINAL  (vulnerable): http://127.0.0.1:$WA/index.php?id=1"
  echo "   CORREGIDA (segura)    : http://127.0.0.1:$WB/index.php?id=1"
  echo "   Cuenta de prueba (corregida): alondra@gmail.com  /  (ver .lab/credenciales_lab.txt)"
}

down() {
  for f in webA webB dbA dbB; do
    [ -f "$LAB/$f.pid" ] && kill "$(cat "$LAB/$f.pid")" 2>/dev/null || true
  done
  # Cierre ordenado de MariaDB por si el kill no basto.
  "$MYSQL" -h127.0.0.1 -P$PA -uroot -e "SHUTDOWN" 2>/dev/null || true
  "$MYSQL" -h127.0.0.1 -P$PB -uroot -e "SHUTDOWN" 2>/dev/null || true
  echo ">> Laboratorio detenido."
}

case "${1:-}" in
  up)   up ;;
  down) down ;;
  *)    echo "Uso: bash tests/lab_local.sh [up|down]"; exit 1 ;;
esac
