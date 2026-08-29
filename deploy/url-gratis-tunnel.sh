#!/usr/bin/env bash
# URL pública y gratis SIN abrir puertos y SIN dominio, usando un túnel de
# Cloudflare. No hace falta cuenta. Resultado: https://algo-random.trycloudflare.com
#
# Útil si no querés (o no podés) abrir 80/443 en el security group.
# Contra: la URL cambia cada vez que se reinicia el túnel.
#
#   sudo bash deploy/url-gratis-tunnel.sh
set -euo pipefail

PUERTO="${PUERTO:-8090}"

if ! command -v cloudflared >/dev/null; then
  echo "==> Instalando cloudflared"
  ARCH=$(dpkg --print-architecture)
  curl -fsSL -o /usr/local/bin/cloudflared \
    "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}"
  chmod +x /usr/local/bin/cloudflared
fi

echo "==> Creando el servicio del túnel"
cat > /etc/systemd/system/equipos-tunnel.service <<UNIT
[Unit]
Description=Tunel Cloudflare para la app de equipos
After=network.target rugby-equipos.service

[Service]
Type=simple
ExecStart=/usr/local/bin/cloudflared tunnel --no-autoupdate --url http://127.0.0.1:$PUERTO
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now equipos-tunnel
sleep 12

echo
echo "==================================================="
journalctl -u equipos-tunnel --no-pager | grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" | tail -1
echo "==================================================="
echo "Esa es tu URL. Para volver a verla en cualquier momento:"
echo "  journalctl -u equipos-tunnel | grep trycloudflare | tail -1"
echo "Dejá SECURE_COOKIE=true en el .env (el túnel sirve por HTTPS)."
