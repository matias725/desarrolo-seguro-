#!/bin/bash
# Arranque de cada instancia del Auto Scaling Group (Amazon Linux 2023).
# Los marcadores @@X@@ los reemplaza infra/crear-infra.sh.
# Instala Docker y git, descarga el repositorio y ejecuta la versión
# publicada (/carta/<amb>/version en SSM) con infra/instancia-desplegar.sh.
# Sin "set -x": así ninguna contraseña aparece en el registro de la consola.
set -euo pipefail
AMB=@@AMB@@; REGION=@@REGION@@; REPO_URL=@@REPO_URL@@
DB_HOST=@@DB_HOST@@; APP_URL=@@APP_URL@@

echo "[carta] inicio del aprovisionamiento ($AMB)"
dnf install -y -q docker git
systemctl enable --now docker

# El rol de la instancia puede tardar unos segundos en estar disponible.
for i in $(seq 1 20); do
  VERSION=$(aws ssm get-parameter --region "$REGION" --name "/carta/$AMB/version" --query Parameter.Value --output text 2>/dev/null) && break
  sleep 15
done
echo "[carta] versión publicada: $VERSION"

git clone -q "$REPO_URL" /opt/src
cat > /etc/carta.conf <<CONF
AMB=$AMB
REGION=$REGION
DB_HOST=$DB_HOST
APP_URL=$APP_URL
CONF
chmod 600 /etc/carta.conf

# Se ejecuta el script de la MISMA versión que se va a publicar.
git -C /opt/src checkout -q --detach "$VERSION" 2>/dev/null || git -C /opt/src checkout -q --detach "origin/$VERSION"
bash /opt/src/carta-digital/infra/instancia-desplegar.sh "$VERSION"
echo "[carta] aprovisionamiento terminado"
