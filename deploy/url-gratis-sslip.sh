#!/usr/bin/env bash
# URL pública y gratis SIN comprar dominio, usando sslip.io (DNS comodín que
# resuelve la IP que está en el propio nombre) + certificado Let's Encrypt.
# Resultado: https://equipos-<tu-ip-con-guiones>.sslip.io  (permanente)
#
# Requisitos: nginx instalado, la app corriendo en 127.0.0.1:8090 y los
# puertos 80 y 443 abiertos en el security group del EC2.
#
#   sudo bash deploy/url-gratis-sslip.sh
set -euo pipefail

DOMINIO_BASE="${DOMINIO_BASE:-sslip.io}"   # alternativa: nip.io
PUERTO="${PUERTO:-8090}"

echo "==> Detectando la IP pública del EC2"
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 60" 2>/dev/null || true)
IP=""
if [ -n "$TOKEN" ]; then
  IP=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" \
    http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || true)
fi
[ -z "$IP" ] && IP=$(curl -s https://api.ipify.org || true)
[ -z "$IP" ] && { echo "No pude detectar la IP pública. Pasala a mano: IP=1.2.3.4 sudo -E bash $0"; exit 1; }

HOSTNAME_APP="equipos-${IP//./-}.${DOMINIO_BASE}"
echo "    IP: $IP"
echo "    URL que vas a tener: https://$HOSTNAME_APP"

echo "==> Verificando que el DNS resuelva"
if command -v getent >/dev/null && ! getent hosts "$HOSTNAME_APP" >/dev/null; then
  echo "    (aviso: todavía no resuelve; si certbot falla, esperá un minuto y reintentá)"
fi

echo "==> Escribiendo la config de nginx"
cat > /etc/nginx/sites-available/equipos <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name $HOSTNAME_APP;

    client_max_body_size 2m;
    access_log /var/log/nginx/equipos.access.log;
    error_log  /var/log/nginx/equipos.error.log;

    location / {
        proxy_pass http://127.0.0.1:$PUERTO;
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/equipos /etc/nginx/sites-enabled/equipos
nginx -t && systemctl reload nginx

echo "==> Certificado HTTPS (Let's Encrypt)"
if ! command -v certbot >/dev/null; then
  apt-get update -qq && apt-get install -y certbot python3-certbot-nginx
fi
certbot --nginx -d "$HOSTNAME_APP" --non-interactive --agree-tos --register-unsafely-without-email --redirect

echo
echo "==================================================="
echo " Listo:  https://$HOSTNAME_APP"
echo "==================================================="
echo "Si Let's Encrypt rechaza el pedido por límite de sslip.io, reintentá con:"
echo "  sudo DOMINIO_BASE=nip.io bash $0"
echo "Acordate de dejar SECURE_COOKIE=true en el .env y reiniciar:"
echo "  sudo systemctl restart rugby-equipos"
