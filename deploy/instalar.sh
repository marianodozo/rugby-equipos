#!/usr/bin/env bash
# Instalación en el EC2 (Ubuntu/Debian). Correr desde la carpeta del proyecto ya copiada.
#   sudo bash deploy/instalar.sh
set -euo pipefail

APP_DIR=/opt/rugby-equipos
SERVICE=rugby-equipos

echo "==> Verificando Node"
if ! command -v node >/dev/null; then
  echo "Node no está instalado. Instalalo primero, por ejemplo:"
  echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs"
  exit 1
fi
node -v

echo "==> Copiando a $APP_DIR"
mkdir -p "$APP_DIR"
rsync -a --exclude node_modules --exclude data --exclude .git ./ "$APP_DIR"/
cd "$APP_DIR"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "!! Creé $APP_DIR/.env — editalo AHORA (sobre todo ADMIN_PASS) y volvé a correr este script."
fi

echo "==> Instalando dependencias"
npm install --omit=dev --no-audit --no-fund

echo "==> Permisos"
OWNER=${SUDO_USER:-ubuntu}
mkdir -p "$APP_DIR/data"
chown -R "$OWNER":"$OWNER" "$APP_DIR"
chmod +x deploy/backup.sh

echo "==> Servicio systemd"
sed "s/^User=.*/User=$OWNER/" deploy/rugby-equipos.service > /etc/systemd/system/$SERVICE.service
systemctl daemon-reload
systemctl enable --now $SERVICE
sleep 1
systemctl --no-pager --lines=15 status $SERVICE || true

echo
echo "Listo. La app escucha en 127.0.0.1:8090 (según .env)."
echo "Siguiente paso: configurar nginx con deploy/nginx-equipos.conf y correr certbot."
