#!/usr/bin/env bash
# Imprime el dominio gratuito sslip.io que le corresponde a este EC2.
# Copiá el resultado en DOMINIO= dentro del .env.
#
#   bash deploy/mi-dominio.sh
set -euo pipefail

TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 60" 2>/dev/null || true)
IP=""
if [ -n "$TOKEN" ]; then
  IP=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" \
    http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || true)
fi
[ -z "$IP" ] && IP=$(curl -s https://api.ipify.org || true)
[ -z "$IP" ] && { echo "No pude detectar la IP pública de esta máquina." >&2; exit 1; }

echo "IP pública: $IP"
echo
echo "Poné esto en el .env:"
echo "DOMINIO=equipos-${IP//./-}.sslip.io"
echo
echo "Y levantá con:  docker compose --profile https up -d"
