#!/usr/bin/env bash
# Corregir un texto mal escrito en la planificación de los entrenamientos.
# Sirve para cuando se coló un typo y quedó como sugerencia: las sugerencias
# salen de lo que ya se cargó, así que al arreglar los bloques el botón con el
# error desaparece solo.
#
# Uso (desde la carpeta del proyecto, en el EC2):
#   bash deploy/corregir-texto.sh lider Javu Javi
#   bash deploy/corregir-texto.sh actividad "Ruk" "Ruck"
#   bash deploy/corregir-texto.sh foco "Lanzamentos" "Lanzamientos"
#
# Primero muestra qué va a cambiar y pide confirmación. Con SI=1 adelante no
# pregunta (para dejarlo en un cron o correrlo sin terminal interactiva).
set -euo pipefail

CAMPO="${1:-}"
VIEJO="${2:-}"
NUEVO="${3:-}"

if [ -z "$CAMPO" ] || [ -z "$VIEJO" ] || [ -z "$NUEVO" ]; then
  echo "Uso: bash deploy/corregir-texto.sh <campo> <texto viejo> <texto nuevo>"
  echo "Campos: actividad | foco | lider"
  exit 1
fi
case "$CAMPO" in
  actividad|foco|lider) ;;
  *) echo "Campo inválido: $CAMPO (usá actividad, foco o lider)"; exit 1 ;;
esac

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# El script corre adentro del contenedor, que ya tiene node y better-sqlite3.
# Los textos van por variables de entorno para no pelear con comillas ni acentos.
CORRECCION=$(cat <<'JS'
const db = require('better-sqlite3')(process.env.DB_PATH);
const campo = process.env.CAMPO, viejo = process.env.VIEJO, nuevo = process.env.NUEVO;

// La comparación ignora mayúsculas: "javu" y "Javu" son el mismo error
const filas = db.prepare(
  `SELECT b.id, b.actividad, b.${campo} AS valor, t.fecha
     FROM training_blocks b JOIN trainings t ON t.id = b.training_id
    WHERE b.${campo} = ? COLLATE NOCASE
    ORDER BY t.fecha`
).all(viejo);

if (!filas.length) {
  console.log(`No hay ningún bloque con ${campo} = "${viejo}". No se cambió nada.`);
  process.exit(3);
}

console.log(`Bloques a corregir (${filas.length}):`);
for (const f of filas) console.log(`  ${f.fecha}  ${f.actividad}  [${f.valor}]`);

if (process.env.APLICAR !== '1') process.exit(0);

const r = db.prepare(
  `UPDATE training_blocks SET ${campo} = ? WHERE ${campo} = ? COLLATE NOCASE`
).run(nuevo, viejo);
console.log(`Listo: ${r.changes} ${r.changes === 1 ? 'bloque corregido' : 'bloques corregidos'}.`);

const queda = db.prepare(
  `SELECT COUNT(*) AS n FROM training_blocks WHERE ${campo} = ? COLLATE NOCASE`
).get(viejo).n;
console.log(queda
  ? `Ojo: todavía quedan ${queda} con "${viejo}".`
  : `"${viejo}" ya no existe, así que deja de aparecer como sugerencia.`);
JS
)

correr() { # $1 = APLICAR
  docker compose -f "$RAIZ/docker-compose.yml" exec -T \
    -e CAMPO="$CAMPO" -e VIEJO="$VIEJO" -e NUEVO="$NUEVO" -e APLICAR="$1" \
    app node -e "$CORRECCION"
}

echo "Buscando bloques con $CAMPO = \"$VIEJO\"…"
set +e
correr 0
estado=$?
set -e
# 3 = no había nada que corregir; no es un error
[ "$estado" -eq 3 ] && exit 0
[ "$estado" -ne 0 ] && { echo "No se pudo leer la base. ¿Está levantado el contenedor?"; exit 1; }

echo
echo "Se van a reemplazar por \"$NUEVO\"."
if [ "${SI:-0}" != "1" ]; then
  read -r -p "¿Sigo? [s/N] " resp
  case "$resp" in s|S|si|SI|Si) ;; *) echo "Cancelado."; exit 0 ;; esac
fi

correr 1
echo
echo "Si tenés la app abierta, refrescá la pantalla para ver los cambios."
