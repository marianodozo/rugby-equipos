#!/usr/bin/env bash
# Backup diario de la base SQLite. Guarda los últimos 14 días.
# Funciona tanto con el deploy en Docker como con el de systemd.
#
# Cron (desde la carpeta del proyecto):
#   0 3 * * * cd /home/ubuntu/rugby-equipos && bash deploy/backup.sh >> backups/backup.log 2>&1
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${BACKUP_DIR:-$RAIZ/backups}"
STAMP=$(date +%Y%m%d-%H%M)
mkdir -p "$DEST"

if docker compose -f "$RAIZ/docker-compose.yml" ps --status running app >/dev/null 2>&1 \
   && [ -n "$(docker compose -f "$RAIZ/docker-compose.yml" ps -q app 2>/dev/null)" ]; then
  # Deploy con Docker: copia consistente usando el propio SQLite del contenedor
  docker compose -f "$RAIZ/docker-compose.yml" exec -T app node -e "
    const db = require('better-sqlite3')(process.env.DB_PATH, { readonly: true });
    db.backup('/app/data/.backup-tmp.db').then(() => { db.close(); });
  "
  mv "$RAIZ/data/.backup-tmp.db" "$DEST/rugby-$STAMP.db"
else
  # Deploy sin Docker
  DB="${DB_PATH:-/opt/rugby-equipos/data/rugby.db}"
  command -v sqlite3 >/dev/null || { echo "Falta sqlite3: sudo apt-get install -y sqlite3"; exit 1; }
  sqlite3 "$DB" ".backup '$DEST/rugby-$STAMP.db'"
fi

gzip -f "$DEST/rugby-$STAMP.db"
find "$DEST" -name 'rugby-*.db.gz' -mtime +14 -delete
echo "backup ok: $DEST/rugby-$STAMP.db.gz"
