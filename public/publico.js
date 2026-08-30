/* Vista pública del partido: solo lectura, sin login y sin acciones.
   Muestra tiempo, resultado y cronología (sin penales cometidos). */
'use strict';

const TOKEN = location.pathname.split('/')[2] || '';
const app = document.getElementById('app');

const NOMBRE_TIPO = {
  try: 'Try', conversion: 'Conversión', penal: 'Penal', drop: 'Drop',
  try_penal: 'Try penal', amarilla: 'Tarjeta amarilla', roja: 'Tarjeta roja',
};
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

let DATOS = null;

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
function mmss(seg) {
  seg = Math.max(0, Math.floor(seg));
  return `${String(Math.floor(seg / 60)).padStart(2, '0')}:${String(seg % 60).padStart(2, '0')}`;
}
function fechaCorta(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(iso || '');
  if (!m) return iso || '';
  const [, y, mo, d, h, mi] = m;
  return `${DIAS[new Date(+y, +mo - 1, +d).getDay()]} ${d}/${mo} · ${h}:${mi} hs`;
}
function segundosActuales(v) {
  const p = v.partido;
  const desfase = v.recibido - v.ahora;
  const extra = p.reloj_corriendo && p.reloj_desde
    ? Math.floor((Date.now() - desfase - p.reloj_desde) / 1000) : 0;
  return p.reloj_base_seg + extra;
}
function nombrePeriodo(p) {
  return p.periodo === 0 ? 'Todavía no empezó'
    : p.periodo === 1 ? '1er tiempo'
    : p.periodo === 2 ? '2do tiempo' : 'Final';
}
function nombreCorto(club) { return String(club || '').split(' ')[0]; }
function nombreEquipo(club, letra) { return `${nombreCorto(club)} ${letra}`; }

async function traer() {
  const res = await fetch('/api/publico/' + TOKEN, { cache: 'no-store' });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'No se pudo cargar el partido');
  d.recibido = Date.now();
  return d;
}

function pintar() {
  const v = DATOS, p = v.partido;
  const eventos = v.eventos.slice().reverse();
  const corriendo = !!p.reloj_corriendo;

  app.innerHTML = `
  <div class="app">
    <div class="topbar">
      <img class="marca" src="/logo.png" alt="">
      <h1 class="trunc">${esc(nombreEquipo(v.club, p.equipo))}<span class="sub trunc">vs ${esc(p.rival)}${p.lugar ? ' · ' + esc(p.lugar) : ''}</span></h1>
    </div>
    <main>
      <div class="marcador">
        <div class="lado">
          <span class="eq trunc">${esc(nombreEquipo(v.club, p.equipo))}</span>
          <span class="pts">${v.marcador.nosotros}</span>
        </div>
        <span class="sep">–</span>
        <div class="lado">
          <span class="eq trunc">${esc(p.rival)}</span>
          <span class="pts">${v.marcador.rival}</span>
        </div>
      </div>

      <div class="card reloj-card">
        <div class="row">
          <span class="chip ${corriendo ? '' : 'b'}">${nombrePeriodo(p)}</span>
          <div class="grow"></div>
          <span class="muted">${p.estado === 'finalizado' ? 'terminado' : corriendo ? 'en juego' : 'detenido'}</span>
        </div>
        <div id="reloj" class="reloj ${corriendo ? 'on' : ''}">${mmss(segundosActuales(v))}</div>
        <div class="muted">${fechaCorta(p.fecha_hora)}</div>
      </div>

      <div class="sec-title">Cronología</div>
      ${eventos.length ? eventos.map((e) => `
        <div class="card evento" style="padding:10px 12px">
          <div class="row">
            <span class="min">${Math.floor(e.t_abs / 60) + 1}'</span>
            <span class="grow trunc">
              <span style="font-weight:600">${esc(NOMBRE_TIPO[e.tipo] || e.tipo)}${e.puntos ? ` <span class="muted">+${e.puntos}</span>` : ''}</span>
              <span class="muted trunc" style="display:block">${e.equipo === 'rival' ? esc(p.rival) : (e.apellido ? esc(e.nombre + ' ' + e.apellido) : esc(nombreEquipo(v.club, p.equipo)))}</span>
            </span>
          </div>
        </div>`).join('')
      : '<div class="muted" style="padding:4px 6px">Todavía no pasó nada.</div>'}

      <p class="muted" style="text-align:center;margin:24px 0 8px">
        Seguimiento en vivo de ${esc(v.club)}. Esta pantalla se actualiza sola.
      </p>
    </main>
  </div>`;
}

function tick() {
  if (!DATOS) return;
  const r = document.getElementById('reloj');
  if (r) r.textContent = mmss(segundosActuales(DATOS));
}

function firma(v) {
  return [v.partido.estado, v.partido.periodo, v.partido.reloj_corriendo,
    v.partido.reloj_base_seg, v.partido.reloj_desde, v.eventos.length,
    v.marcador.nosotros, v.marcador.rival].join('|');
}

async function sincronizar() {
  try {
    const nuevo = await traer();
    if (DATOS && firma(nuevo) === firma(DATOS)) {
      DATOS.ahora = nuevo.ahora;
      DATOS.recibido = nuevo.recibido;
      return;
    }
    DATOS = nuevo;
    pintar();
  } catch (e) { /* si se cae la red, dejamos lo último que mostramos */ }
}

(async () => {
  try {
    DATOS = await traer();
    pintar();
    setInterval(tick, 1000);
    setInterval(sincronizar, 10000);
  } catch (err) {
    app.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
  }
})();
