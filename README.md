# Barceló Rugby — Armado de equipos

App web mobile-first para armar los equipos de cada partido desde el celular.
Node + Express + SQLite, sin servicios externos. Corre en un contenedor al lado
de los bots que ya tenés en el EC2 y consume muy pocos recursos: se despliega con
`git clone` + `docker compose up -d`.

## Qué hace

- **Jugadores**: alta/baja/modificación con DNI, nombre, apellido y apodo. Búsqueda instantánea por apellido, nombre, apodo o DNI.
- **Partidos**: Barceló A o Barceló B, rival, lugar, fecha y hora, notas. En la
  base se guarda solo la letra; el nombre que se muestra sale de `CLUB_NOMBRE`
  (servidor) y de la constante `CLUB` de `public/app.js`, así que si cambia el
  nombre del club cambia en todos lados.
- **Usuarios**: todos con los mismos permisos. Login con usuario y contraseña, sesión de 90 días (no te pide login cada vez desde el celu).
- **Armado del plantel**: 25 lugares con **posición fija por número** (1 pilar izquierdo, 2 hooker, 9 medio scrum, 10 apertura, etc.). Cada asignación se guarda al instante, así que podés cargar el equipo en varios momentos, desde varios celulares.
- **Export a WhatsApp**: genera el listado numerado del 1 al 25 con nombre, apellido y DNI, con botón para copiar o abrir WhatsApp directamente.
- **Seguimiento en vivo** (pestaña *En vivo*): cronómetro de los dos tiempos, marcador, puntos con jugador, tarjetas con cuenta regresiva y cronología del partido.

### Cómo se asigna un jugador (lo más usado)

1. Entrás al partido y tocás **+ Agregar jugador**: la app abre el primer número libre.
2. Escribís dos o tres letras del apellido o del apodo y tocás al jugador.
3. Queda asignado y **salta solo al siguiente número libre** con el buscador limpio y el teclado abierto — cargás los 23 sin salir de la pantalla.

Extras:
- Si querés un número puntual, tocás ese casillero en la lista y elegís ahí.
- Si el jugador no existe todavía: **Nuevo jugador** dentro del mismo buscador (te precarga apellido y nombre con lo que escribiste), lo guardás y queda asignado.
- Si asignás a alguien que ya estaba en otro número del mismo partido, se **mueve** (y si el destino estaba ocupado, se intercambian). Nunca queda duplicado.
- Menú **⋮** del partido: copiar el plantel de otro partido, compactar números (saca los huecos), vaciar plantel, editar o borrar.

Se puede "instalar" en el celular: abrir en Chrome/Safari → *Agregar a pantalla de inicio*. Queda como una app (PWA).

### Posiciones por número

Cada casillero muestra la posición, así el que carga sabe qué está llenando:

| N° | Posición | N° | Posición |
|---|---|---|---|
| 1 | Pilar izquierdo | 14 | Wing derecho |
| 2 | Hooker | 15 | Full back |
| 3 | Pilar derecho | 16 | Hooker suplente |
| 4 | Segunda línea | 17 | Pilar suplente |
| 5 | Segunda línea | 18 | Pilar suplente |
| 6 | Ala ciego | 19 | Segunda línea suplente |
| 7 | Ala abierto | 20 | Tercera línea suplente |
| 8 | Octavo | 21 | Medio scrum suplente |
| 9 | Medio scrum | 22 | Apertura suplente |
| 10 | Apertura | 23 | Comodín |
| 11 | Wing izquierdo | 24 | Adicional |
| 12 | Primer centro | 25 | Adicional |
| 13 | Segundo centro | | |

Si en el club usan otros nombres (o arman el banco distinto), se cambian en un
solo lugar: la lista `POSICIONES` arriba de todo en `public/app.js`. No hay que
tocar nada más ni migrar la base.

### Seguimiento en vivo

La pestaña **En vivo** sigue el partido desde la cancha:

- **Reloj**: dos tiempos de 40 minutos, con arranque y parada para cada
  interrupción. **Vive en el servidor**, así que si lo arranca uno lo ven todos,
  y si se cierra la app el tiempo sigue bien. Se puede corregir a mano desde el
  menú ⋮ si alguien se olvidó de pararlo.
- **Puntos**: try (5), conversión (2), penal (3), drop (3) y try penal (7).
  Primero elegís de qué lado fue con el selector, y si es nuestro te pide el
  jugador — buscando por número del plantel, apellido o apodo, y con la opción
  *Sin jugador* si no lo viste. Del rival solo se guarda el tipo de punto.
- **Tarjetas**: amarilla y roja, nuestras o del rival. La amarilla muestra
  cuánto le queda de los 10 minutos, contando **tiempo de juego**: si el reloj
  está parado, la sanción no corre.
- **Formaciones**: scrum y line con **ganado, perdido y robado**, y knock on de un
  toque. Todo se carga desde nuestro lado — las formaciones del rival no se
  registran — así que no hay que elegir equipo. El porcentaje sale de ganado
  sobre ganado más perdido; los robados se cuentan aparte, porque son mérito y
  no eficiencia propia. Cada toque se guarda al instante y el aviso de abajo
  trae **Deshacer** por si erraste el botón.
- **Penales cometidos**: los que comete el equipo, con el tipo de infracción
  (offside, no soltar, no rolar, manos en el ruck, entrada al costado, tackle
  alto, juego peligroso, obstrucción, scrum, line, antideportivo, otro) y el
  jugador. Del rival se cuenta la cantidad, sin tipo ni jugador. Arriba de los
  botones queda el contador: total de cada lado, desglose por tipo y por
  jugador. La lista de tipos se cambia en la constante `TIPOS_PENAL` de
  `public/app.js`.
- **Cronología**: todo lo cargado con su minuto, y una X para borrar lo que se
  cargó mal.
- La pantalla está partida en tres pestañas —**Puntos, Formaciones y
  Cronología**— con el marcador y el reloj fijos arriba. El reloj se toca para
  arrancar o parar, así que se maneja desde cualquiera de las tres.
- La pantalla se refresca sola cada 8 segundos, así que dos personas pueden
  cargar en paralelo desde sus celulares. Mientras esté abierta, la app pide no
  apagar la pantalla.

Los estados del partido son **programado → en curso → finalizado**. En la lista
de Partidos, los que están en juego aparecen arriba con el marcador en vivo, y
los terminados quedan en *Anteriores* con el resultado. Desde cualquiera de los
dos se exporta a WhatsApp, eligiendo entre **Plantel** (el listado 1-25) y
**Resumen** (resultado, quién hizo los puntos, las formaciones con sus
porcentajes, los penales cometidos y las tarjetas).

### Compartir

Desde la pantalla **En vivo** (o desde un partido ya jugado) hay dos formas de
mostrar el partido afuera del club:

- **Imagen del resultado**: una placa PNG con el escudo, el marcador y la
  cronología, pensada para WhatsApp e Instagram. Se genera en el propio celular
  y sale por el menú nativo de compartir; si el navegador no lo soporta, se
  descarga. **No incluye los penales cometidos.**
- **Enlace en vivo**: `https://tu-dominio/v/<token>` — una página de **solo
  lectura**, sin login, que muestra el tiempo corriendo, el resultado y **los
  puntos con quién los hizo**, y se actualiza sola cada 10 segundos. Nada más:
  ni tarjetas, ni penales cometidos, ni formaciones, ni DNI, ni plantel. El
  recorte lo hace la API, no la pantalla, así que esos datos no viajan al
  navegador de nadie. Quien abre el enlace no puede tocar nada, y todo lo que
  modifica sigue pidiendo sesión. El enlace se da de baja cuando quieras desde
  la misma pantalla, y deja de funcionar para todos.

### Identidad del club

La app usa el escudo y los colores de Barceló Rugby: azul marino `#293263` y el
rosa de los arcos `#9e4a72` como acento (posiciones, Equipo B). Tema claro y
oscuro, según cómo tenga el celular cada uno.

- `public/logo.png` — escudo con fondo transparente (login y barra superior).
- `public/icon-192.png` / `icon-512.png` — íconos para la pantalla de inicio.
- Colores: variables `--marca`, `--marca-osc`, `--marca-claro` y `--acento` al
  principio de `public/styles.css`.
- El nombre del club sale de `CLUB_NOMBRE` en el `.env` (encabeza el texto de
  WhatsApp) y de la constante `CLUB` en `public/app.js` (login).

Para cambiar el escudo alcanza con reemplazar esos tres PNG por otros del mismo
tamaño.

---

## Deploy en el EC2 (Docker Compose)

El código vive en GitHub y el EC2 solo clona y levanta. No hace falta instalar
Node ni compilar nada en el server.

### 0. Docker (una sola vez)

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # para no tener que usar sudo; salí y volvé a entrar
```

### 1. Clonar y configurar

```bash
git clone https://github.com/USUARIO/rugby-equipos.git
cd rugby-equipos
cp .env.example .env
nano .env        # ¡cambiá ADMIN_PASS!
```

| Variable | Para qué |
|---|---|
| `PUERTO_HOST` | Puerto en el host, publicado solo en `127.0.0.1` (8090 por defecto). |
| `DOMINIO` | Dominio para el perfil `https` (Caddy). `bash deploy/mi-dominio.sh` te lo arma gratis con sslip.io. |
| `ADMIN_USER` / `ADMIN_PASS` | Usuario inicial. **Solo se usa la primera vez**, cuando la base está vacía. |
| `CLUB_NOMBRE` | Encabeza el texto que se manda por WhatsApp. |
| `SESSION_DAYS` | Días que dura la sesión en el celular (90 por defecto). |
| `SECURE_COOKIE` | `true` con HTTPS. `false` solo si probás por `http://ip:puerto`. |

El `.env` está en el `.gitignore`: nunca se commitea.

### 2. Levantar

**Opción A — con HTTPS incluido** (necesita los puertos 80 y 443 libres en el
host y abiertos en el security group). Caddy saca y renueva el certificado solo:

```bash
bash deploy/mi-dominio.sh          # te dice qué poner en DOMINIO=
docker compose --profile https up -d
```

**Opción B — detrás del nginx que ya tenés** (si los bots ya usan el 80/443):

```bash
docker compose up -d               # queda en 127.0.0.1:8090
sudo bash deploy/url-gratis-sslip.sh    # configura nginx + certbot con sslip.io
```

o, si preferís tu propio subdominio, `deploy/nginx-equipos.conf` + `certbot --nginx`.

**Opción C — sin abrir ningún puerto**: `docker compose up -d` y después
`sudo bash deploy/url-gratis-tunnel.sh` (túnel de Cloudflare; la URL cambia en
cada reinicio).

### 3. Día a día

```bash
docker compose ps                  # estado
docker compose logs -f app         # logs en vivo
docker compose restart app         # reiniciar
docker compose down                # bajar (la base queda en ./data)
```

### 4. Actualizar

```bash
cd ~/rugby-equipos
git pull
docker compose up -d --build       # respeta .env y ./data
```

### 5. Backup

La base es un archivo en `./data/rugby.db` (volumen montado desde el host, así
que sobrevive a cualquier rebuild). Para copias diarias:

```bash
crontab -e
# agregar:
0 3 * * * cd /home/ubuntu/rugby-equipos && bash deploy/backup.sh >> backups/backup.log 2>&1
```

Guarda una copia comprimida por día en `backups/`, con retención de 14 días.

### Si algo no arranca

| Síntoma | Qué pasa |
|---|---|
| `env file .env not found` | Falta el paso `cp .env.example .env`. |
| `EACCES` / `SQLITE_CANTOPEN` en los logs | La carpeta `data/` quedó de otro usuario. `sudo chown -R 1000:1000 data`. |
| El navegador no guarda la sesión | Estás entrando por `http://` con `SECURE_COOKIE=true`. Poné `false` o entrá por HTTPS. |
| Caddy no saca el certificado | El DNS todavía no resuelve o el 80/443 está cerrado en el security group. |

---

## Deploy sin Docker (alternativa)

Si preferís correrlo directo con Node y systemd:

```bash
sudo bash deploy/instalar.sh       # copia a /opt/rugby-equipos, npm install y systemd
sudo systemctl status rugby-equipos
```

Requiere Node 18+ (`curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs`)
y usar las variables `PORT`, `HOST` y `DB_PATH` del `.env` (están comentadas al
final del `.env.example`).

---

## Estructura

```
Dockerfile           imagen de la app (multi-stage, sin compiladores en la final)
docker-compose.yml   servicio app + perfil opcional "https" con Caddy
src/server.js        API REST + sesiones + export
src/db.js            esquema SQLite y usuario inicial
public/              app mobile (HTML/CSS/JS, sin frameworks) + PWA
deploy/              Caddyfile, nginx, backup, scripts de URL, systemd
data/rugby.db        base de datos (se crea sola, fuera del repo)
```

## Notas técnicas

- Contraseñas con bcrypt; sesiones por cookie `HttpOnly` guardadas en la base (se pueden revocar cambiando la contraseña).
- El DNI se guarda solo con números (si lo escribís con puntos, los saca) y es único.
- Borrar un jugador que ya jugó partidos no lo elimina: lo marca **inactivo** para no romper listados viejos.
- La fecha y hora se guardan como texto local (`2026-09-05T16:00`), sin zona horaria: lo que cargás es lo que se muestra y se exporta.
- La base es un archivo: para llevarte los datos, copiás `data/rugby.db`.
