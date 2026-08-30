/* Armado de equipos - app mobile (vanilla JS) */
'use strict';

const TITULARES = 15, SUPLENTES = 8, ADICIONALES = 2, TOTAL = 25;
const GRUPOS = [
  { titulo: 'Titulares', desde: 1, hasta: 15, corto: 'Tit' },
  { titulo: 'Suplentes', desde: 16, hasta: 23, corto: 'Sup' },
  { titulo: 'Adicionales', desde: 24, hasta: 25, corto: 'Adic' },
];

/* Posición fija de cada número (numeración clásica de rugby union).
   Para cambiar los nombres, editá solo esta lista. */
const POSICIONES = {
  1: 'Pilar izquierdo', 2: 'Hooker', 3: 'Pilar derecho',
  4: 'Segunda línea', 5: 'Segunda línea',
  6: 'Ala ciego', 7: 'Ala abierto', 8: 'Octavo',
  9: 'Medio scrum', 10: 'Apertura',
  11: 'Wing izquierdo', 12: 'Primer centro', 13: 'Segundo centro',
  14: 'Wing derecho', 15: 'Full back',
  16: 'Hooker suplente', 17: 'Pilar suplente', 18: 'Pilar suplente',
  19: 'Segunda línea suplente', 20: 'Tercera línea suplente',
  21: 'Medio scrum suplente', 22: 'Apertura suplente', 23: 'Comodín',
  24: 'Adicional', 25: 'Adicional',
};
const posicion = (n) => POSICIONES[n] || '';

/* Formas de sumar puntos y su valor */
const TIPOS_PUNTO = [
  { k: 'try', n: 'Try', p: 5 },
  { k: 'conversion', n: 'Conversión', p: 2 },
  { k: 'penal', n: 'Penal', p: 3 },
  { k: 'drop', n: 'Drop', p: 3 },
  { k: 'try_penal', n: 'Try penal', p: 7 },
];
const NOMBRE_TIPO = {
  try: 'Try', conversion: 'Conversión', penal: 'Penal', drop: 'Drop',
  try_penal: 'Try penal', amarilla: 'Amarilla', roja: 'Roja',
  infraccion: 'Penal cometido',
};

/* Tipos de penal que comete el equipo. Para cambiarlos, editá solo esta lista:
   lo que figura acá es lo que se guarda y lo que sale en el resumen. */
const TIPOS_PENAL = [
  'Offside', 'No soltar', 'No rolar', 'Manos en el ruck',
  'Entrada al costado', 'Tackle alto', 'Juego peligroso', 'Obstrucción',
  'Scrum', 'Line', 'Antideportivo', 'Otro',
];
const DUR_AMARILLA = 600;

/* Nombre del club: se muestra en el login y encabeza el texto de WhatsApp. */
const CLUB = 'Barceló Rugby';

const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');
const sheetRoot = $('#sheet-root');

let ME = null;
let CACHE_JUGADORES = null;

/* ------------------------------------------------------------------ util */

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function toast(msg, err) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (err ? ' err' : '');
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, 2600);
}

async function api(url, opts = {}) {
  const res = await fetch('/api' + url, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401 && !url.startsWith('/login')) {
    ME = null;
    location.hash = '';
    renderLogin();
    throw new Error('Sesión vencida');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error de conexión');
  return data;
}

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
function fechaCorta(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(iso || '');
  if (!m) return iso || '';
  const [, y, mo, d, h, mi] = m;
  const dt = new Date(+y, +mo - 1, +d);
  return `${DIAS[dt.getDay()]} ${d}/${mo} · ${h}:${mi} hs`;
}
function esFuturo(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(iso || '');
  if (!m) return false;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime() > Date.now() - 6 * 3600 * 1000;
}
function iniciales(p) {
  return ((p.nombre || ' ')[0] + (p.apellido || ' ')[0]).toUpperCase();
}
function nombreCompleto(p) {
  return `${p.apellido}, ${p.nombre}`;
}
const ICON = {
  partidos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>',
  jugadores: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5"/><path d="M17 11.2a3 3 0 100-6M18 14.6c2.2.5 3.6 2.1 3.6 4.4"/></svg>',
  usuarios: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="3.5"/><path d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6"/></svg>',
  buscar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  vivo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="13" r="8"/><path d="M12 9.5V13l2.2 1.6M9.5 2h5M18.6 5.6l1.4 1.4"/></svg>',
};

/* ----------------------------------------------------------------- sheet */

function openSheet(titulo, bodyHTML, onMount, opts = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'backdrop';
  wrap.innerHTML = `
    <div class="sheet${opts.alta ? ' alta' : ''}" role="dialog" aria-modal="true">
      <header>
        <h2>${titulo}</h2>
        <button type="button" aria-label="Cerrar" data-close>&times;</button>
      </header>
      ${opts.sticky ? `<div class="sticky">${opts.sticky}</div>` : ''}
      <div class="body">${bodyHTML}</div>
    </div>`;
  wrap.addEventListener('click', (e) => { if (e.target === wrap) closeSheet(); });
  wrap.querySelector('[data-close]').onclick = () => closeSheet();
  sheetRoot.appendChild(wrap);
  document.body.style.overflow = 'hidden';
  if (onMount) onMount(wrap);
  return wrap;
}

function closeSheet() {
  const last = sheetRoot.lastElementChild;
  if (last) last.remove();
  if (!sheetRoot.children.length) document.body.style.overflow = '';
}

function confirmar(texto, onOk, textoBoton = 'Sí, borrar') {
  openSheet('Confirmar', `
    <p style="margin:4px 0 18px">${esc(texto)}</p>
    <button class="btn dan" data-ok>${esc(textoBoton)}</button>
    <div style="height:8px"></div>
    <button class="btn sec" data-no>Cancelar</button>
  `, (w) => {
    w.querySelector('[data-ok]').onclick = () => { closeSheet(); onOk(); };
    w.querySelector('[data-no]').onclick = () => closeSheet();
  });
}

/* ----------------------------------------------------------------- login */

function renderLogin() {
  document.body.style.overflow = '';
  sheetRoot.innerHTML = '';
  app.innerHTML = `
  <div class="login-wrap"><div class="login-box">
    <div class="logo">
      <img src="/logo.png" alt="Barceló Rugby" width="132" height="132">
      <h1>${esc(CLUB)}</h1>
      <p class="claim">Armado de equipos</p>
    </div>
    <form id="f">
      <label>Usuario</label>
      <input name="username" autocomplete="username" autocapitalize="none" required>
      <label>Contraseña</label>
      <input name="password" type="password" autocomplete="current-password" required>
      <div style="height:20px"></div>
      <button class="btn" type="submit">Entrar</button>
    </form>
  </div></div>`;
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    try {
      const r = await api('/login', { method: 'POST', body: { username: fd.get('username'), password: fd.get('password') } });
      ME = r.user;
      location.hash = '#/partidos';
      router();
    } catch (err) {
      toast(err.message, true);
      btn.disabled = false;
    }
  };
}

/* --------------------------------------------------------------- layout */

function shell({ titulo, sub, back, acciones = '', contenido, tab, fab }) {
  app.innerHTML = `
  <div class="app">
    <div class="topbar">
      ${back ? `<button data-back aria-label="Volver">&#8249;</button>` : `<img class="marca" src="/logo.png" alt="">`}
      <h1 class="trunc">${esc(titulo)}${sub ? `<span class="sub trunc">${esc(sub)}</span>` : ''}</h1>
      ${acciones}
    </div>
    <main>${contenido}</main>
    ${fab ? `<button class="fab" data-fab aria-label="Agregar">+</button>` : ''}
    <nav class="nav">
      <a href="#/partidos" class="${tab === 'partidos' ? 'on' : ''}">${ICON.partidos}Partidos</a>
      <a href="#/vivo" class="${tab === 'vivo' ? 'on' : ''}">${ICON.vivo}En vivo</a>
      <a href="#/jugadores" class="${tab === 'jugadores' ? 'on' : ''}">${ICON.jugadores}Jugadores</a>
      <a href="#/usuarios" class="${tab === 'usuarios' ? 'on' : ''}">${ICON.usuarios}Usuarios</a>
    </nav>
  </div>`;
  const b = $('[data-back]');
  if (b) b.onclick = () => history.back();
}

/* -------------------------------------------------------------- partidos */

async function viewPartidos() {
  const ms = await api('/matches');
  const enCurso = ms.filter((m) => m.estado === 'en_curso');
  const terminados = ms.filter((m) => m.estado === 'finalizado');
  const resto = ms.filter((m) => m.estado !== 'en_curso' && m.estado !== 'finalizado');
  const proximos = resto.filter((m) => esFuturo(m.fecha_hora));
  const viejos = resto.filter((m) => !esFuturo(m.fecha_hora));
  const anteriores = terminados.concat(viejos)
    .sort((a, b) => String(b.fecha_hora).localeCompare(String(a.fecha_hora)));

  const tarjeta = (m, vivo) => `
    <div class="card tap ${vivo ? 'vivo' : ''}" data-id="${m.id}" data-vivo="${vivo ? 1 : 0}">
      <div class="row">
        <span class="chip ${m.equipo === 'B' ? 'b' : ''}">Equipo ${m.equipo}</span>
        ${vivo ? '<span class="chip vivo-chip">● EN VIVO</span>' : ''}
        <div class="grow"></div>
        ${m.estado === 'finalizado' || vivo
          ? `<span class="marcador-mini">${m.puntos_nosotros} - ${m.puntos_rival}</span>`
          : `<span class="muted">${m.cargados}/25</span>`}
      </div>
      <div style="font-weight:650;font-size:17px;margin:7px 0 2px" class="trunc">vs ${esc(m.rival)}</div>
      <div class="muted trunc">${fechaCorta(m.fecha_hora)}${m.lugar ? ' · ' + esc(m.lugar) : ''}</div>
    </div>`;

  const contenido = !ms.length
    ? `<div class="empty">Todavía no hay partidos.<br>Tocá el botón + para crear el primero.</div>`
    : `${enCurso.length ? `<div class="sec-title">En juego</div>${enCurso.map((m) => tarjeta(m, true)).join('')}` : ''}
       ${proximos.length ? `<div class="sec-title">Próximos</div>${proximos.map((m) => tarjeta(m)).join('')}` : ''}
       ${anteriores.length ? `<div class="sec-title">Anteriores</div>${anteriores.map((m) => tarjeta(m)).join('')}` : ''}`;

  shell({
    titulo: 'Partidos',
    sub: ME ? ME.nombre : '',
    contenido,
    tab: 'partidos',
    fab: true,
    acciones: `<button data-menu aria-label="Menú">&#8942;</button>`,
  });

  $('[data-fab]').onclick = () => formPartido();
  $('[data-menu]').onclick = () => menuCuenta();
  app.querySelectorAll('[data-id]').forEach((el) => {
    el.onclick = () => {
      location.hash = (el.dataset.vivo === '1' ? '#/vivo/' : '#/partido/') + el.dataset.id;
    };
  });
}

function formPartido(m) {
  const editar = !!m;
  openSheet(editar ? 'Editar partido' : 'Nuevo partido', `
    <form id="fp">
      <label>Equipo</label>
      <div class="two">
        <label style="margin:0"><input type="radio" name="equipo" value="A" ${!m || m.equipo === 'A' ? 'checked' : ''} style="width:auto;margin-right:8px"> Equipo A</label>
        <label style="margin:0"><input type="radio" name="equipo" value="B" ${m && m.equipo === 'B' ? 'checked' : ''} style="width:auto;margin-right:8px"> Equipo B</label>
      </div>
      <label>Rival</label>
      <input name="rival" required value="${esc(m ? m.rival : '')}" placeholder="Club rival">
      <label>Lugar</label>
      <input name="lugar" value="${esc(m && m.lugar ? m.lugar : '')}" placeholder="Cancha">
      <label>Fecha y hora</label>
      <input name="fecha_hora" type="datetime-local" required value="${esc(m ? String(m.fecha_hora).slice(0, 16) : '')}">
      <label>Notas (opcional)</label>
      <input name="notas" value="${esc(m && m.notas ? m.notas : '')}" placeholder="Ej: citación 14:00">
      <div style="height:20px"></div>
      <button class="btn" type="submit">${editar ? 'Guardar' : 'Crear partido'}</button>
    </form>
  `, (w) => {
    const f = w.querySelector('#fp');
    f.onsubmit = async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(f));
      try {
        if (editar) {
          await api('/matches/' + m.id, { method: 'PUT', body: fd });
          closeSheet();
          router();
        } else {
          const r = await api('/matches', { method: 'POST', body: fd });
          closeSheet();
          location.hash = '#/partido/' + r.id;
        }
        toast('Partido guardado');
      } catch (err) { toast(err.message, true); }
    };
  });
}

/* ------------------------------------------------------- partido: plantel */

async function viewPartido(id) {
  const m = await api('/matches/' + id);
  const porNumero = {};
  m.roster.forEach((r) => { porNumero[r.numero] = r; });

  const bloques = GRUPOS.map((g) => {
    const filas = [];
    for (let n = g.desde; n <= g.hasta; n++) {
      const p = porNumero[n];
      filas.push(p
        ? `<div class="slot" data-slot="${n}">
             <span class="num">${n}</span>
             <span class="grow trunc">
               <span class="pos">${esc(posicion(n))}</span>
               <span class="nom trunc" style="display:block">${esc(nombreCompleto(p))}</span>
               <span class="muted trunc" style="display:block">${p.apodo ? esc(p.apodo) + ' · ' : ''}DNI ${esc(p.dni)}</span></span>
             <button class="x" data-quitar="${n}" aria-label="Quitar">&times;</button>
           </div>`
        : `<div class="slot vacio" data-slot="${n}">
             <span class="num">${n}</span>
             <span class="grow trunc">
               <span class="pos">${esc(posicion(n))}</span>
               <span class="muted trunc" style="display:block">Tocá para asignar</span></span>
           </div>`);
    }
    const cnt = m.roster.filter((r) => r.numero >= g.desde && r.numero <= g.hasta).length;
    return `<div class="sec-title">${g.titulo} · ${cnt}/${g.hasta - g.desde + 1}</div>${filas.join('')}`;
  }).join('');

  const contenido = `
    <div class="progreso">
      ${GRUPOS.map((g) => {
        const c = m.roster.filter((r) => r.numero >= g.desde && r.numero <= g.hasta).length;
        return `<span class="chip ${c ? '' : 'b'}">${g.corto} ${c}/${g.hasta - g.desde + 1}</span>`;
      }).join('')}
      <span class="chip">Total ${m.roster.length}/25</span>
    </div>
    <button class="btn" data-agregar>+ Agregar jugador</button>
    <div style="height:10px"></div>
    <button class="btn sec" data-vivo>${m.estado === 'finalizado' ? 'Ver el partido jugado' : m.estado === 'en_curso' ? '● Seguir en vivo' : '▶ Seguir el partido en vivo'}</button>
    <div style="height:10px"></div>
    <button class="btn sec" data-exportar>Exportar para WhatsApp</button>
    ${m.estado === 'programado' ? '' : `<div style="height:10px"></div>
    <button class="btn sec" data-compartir>Compartir resultado o enlace</button>`}
    ${bloques}`;

  shell({
    titulo: `Equipo ${m.equipo} vs ${m.rival}`,
    sub: (m.estado === 'finalizado' ? 'Final · ' : m.estado === 'en_curso' ? 'En juego · ' : '') +
         fechaCorta(m.fecha_hora) + (m.lugar ? ' · ' + m.lugar : ''),
    back: true,
    contenido,
    tab: 'partidos',
    acciones: `<button data-menu aria-label="Opciones">&#8942;</button>`,
  });

  const refrescar = (roster) => { m.roster = roster; viewPartidoRepintar(m); };

  $('[data-agregar]').onclick = () => abrirSelector(m, siguienteLibre(m), refrescar, true);
  $('[data-vivo]').onclick = () => { location.hash = '#/vivo/' + m.id; };
  const bComp = $('[data-compartir]');
  if (bComp) bComp.onclick = () => sheetCompartir(m.id);
  $('[data-exportar]').onclick = () => exportar(m.id);
  $('[data-menu]').onclick = () => menuPartido(m);

  app.querySelectorAll('[data-slot]').forEach((el) => {
    el.onclick = (e) => {
      if (e.target.dataset.quitar) return;
      abrirSelector(m, Number(el.dataset.slot), refrescar, false);
    };
  });
  app.querySelectorAll('[data-quitar]').forEach((el) => {
    el.onclick = async (e) => {
      e.stopPropagation();
      try {
        const r = await api(`/matches/${m.id}/slots/${el.dataset.quitar}`, { method: 'DELETE' });
        refrescar(r.roster);
        toast('Jugador quitado');
      } catch (err) { toast(err.message, true); }
    };
  });
}

function viewPartidoRepintar(m) {
  // re-render conservando el scroll
  const y = window.scrollY;
  viewPartido(m.id).then(() => window.scrollTo(0, y));
}

function siguienteLibre(m, desde = 1) {
  const ocupados = new Set(m.roster.map((r) => r.numero));
  for (let n = desde; n <= TOTAL; n++) if (!ocupados.has(n)) return n;
  return null;
}

function etiquetaNumero(n) {
  return posicion(n) || '';
}

/* ---------------------------------------------- selector de jugador (core) */

async function abrirSelector(m, numero, onCambio, encadenar) {
  if (numero == null) { toast('El plantel ya está completo (25)'); return; }
  if (!CACHE_JUGADORES) CACHE_JUGADORES = await api('/players');

  let target = numero;
  const w = openSheet(`N° ${target} · ${etiquetaNumero(target)}`, `<ul class="plist" id="lista"></ul>`, null, {
    alta: true,
    sticky: `<div class="search">${ICON.buscar}
      <input id="q" placeholder="Buscar por apellido, nombre o apodo" autocomplete="off" autocapitalize="words" enterkeyhint="done">
    </div>`,
  });

  const input = w.querySelector('#q');
  const lista = w.querySelector('#lista');
  const titulo = w.querySelector('h2');

  const pintar = () => {
    const q = norm(input.value.trim());
    const enPartido = new Map(m.roster.map((r) => [r.player_id, r.numero]));
    let items = CACHE_JUGADORES;
    if (q) {
      items = items.filter((p) =>
        norm(p.apellido).includes(q) || norm(p.nombre).includes(q) ||
        norm(p.apodo).includes(q) || String(p.dni).includes(q)
      ).sort((a, b) => {
        const sa = norm(a.apellido).startsWith(q) ? 0 : 1;
        const sb = norm(b.apellido).startsWith(q) ? 0 : 1;
        return sa - sb || norm(a.apellido).localeCompare(norm(b.apellido));
      });
    }
    const html = items.slice(0, 200).map((p) => {
      const n = enPartido.get(p.id);
      return `<li data-p="${p.id}" class="${n ? 'usado' : ''}">
        <span class="ini">${esc(iniciales(p))}</span>
        <span class="grow trunc">
          <span style="font-weight:600">${esc(nombreCompleto(p))}</span>
          <span class="muted trunc" style="display:block">${p.apodo ? esc(p.apodo) + ' · ' : ''}DNI ${esc(p.dni)}</span>
        </span>
        ${n ? `<span class="chip b">N° ${n}</span>` : ''}
      </li>`;
    }).join('');
    lista.innerHTML =
      (html || `<li style="border:0;color:var(--txt-2)">Sin resultados para “${esc(input.value)}”</li>`) +
      `<li data-nuevo style="border:0;margin-top:8px">
         <span class="ini" style="background:var(--marca);color:var(--sobre-marca)">+</span>
         <span class="grow" style="font-weight:600;color:var(--marca)">Nuevo jugador${input.value.trim() ? ` “${esc(input.value.trim())}”` : ''}</span>
       </li>`;

    lista.querySelectorAll('[data-p]').forEach((li) => {
      li.onclick = () => asignar(Number(li.dataset.p));
    });
    lista.querySelector('[data-nuevo]').onclick = () => formJugadorRapido(input.value.trim(), async (nuevo) => {
      CACHE_JUGADORES = await api('/players');
      asignar(nuevo.id);
    });
  };

  const asignar = async (playerId) => {
    try {
      const r = await api(`/matches/${m.id}/slots/${target}`, { method: 'PUT', body: { player_id: playerId } });
      m.roster = r.roster;
      onCambio(r.roster);
      const p = CACHE_JUGADORES.find((x) => x.id === playerId);
      toast(`N° ${target}: ${p ? p.apellido : 'asignado'}`);
      if (encadenar) {
        const prox = siguienteLibre(m, target + 1) || siguienteLibre(m, 1);
        if (prox == null) { closeSheet(); return; }
        target = prox;
        titulo.textContent = `N° ${target} · ${etiquetaNumero(target)}`;
        input.value = '';
        input.focus();
        pintar();
      } else {
        closeSheet();
      }
    } catch (err) { toast(err.message, true); }
  };

  input.addEventListener('input', pintar);
  pintar();
  setTimeout(() => input.focus(), 120);
}

function formJugadorRapido(texto, onOk) {
  const partes = texto.split(/\s+/).filter(Boolean);
  const nombre = partes.length > 1 ? partes.slice(0, -1).join(' ') : '';
  const apellido = partes.length ? partes[partes.length - 1] : '';
  openSheet('Nuevo jugador', `
    <form id="fj">
      <label>Apellido</label><input name="apellido" required value="${esc(apellido)}">
      <label>Nombre</label><input name="nombre" required value="${esc(nombre)}">
      <label>DNI</label><input name="dni" required inputmode="numeric" pattern="[0-9]*">
      <label>Apodo (opcional)</label><input name="apodo">
      <div style="height:18px"></div>
      <button class="btn" type="submit">Guardar y asignar</button>
    </form>
  `, (w) => {
    w.querySelector('#fj').onsubmit = async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      try {
        const r = await api('/players', { method: 'POST', body: fd });
        closeSheet();
        onOk({ id: r.id, ...fd });
      } catch (err) { toast(err.message, true); }
    };
  });
}

/* ------------------------------------------------------- menú de partido */

function menuPartido(m) {
  openSheet('Opciones del partido', `
    <button class="btn sec" data-a="editar">Editar datos del partido</button><div style="height:8px"></div>
    <button class="btn sec" data-a="copiar">Copiar plantel de otro partido</button><div style="height:8px"></div>
    <button class="btn sec" data-a="compactar">Compactar números (sacar huecos)</button><div style="height:8px"></div>
    <button class="btn sec" data-a="vaciar">Vaciar plantel</button><div style="height:8px"></div>
    <button class="btn dan" data-a="borrar">Borrar partido</button>
  `, (w) => {
    w.querySelectorAll('[data-a]').forEach((b) => {
      b.onclick = async () => {
        const a = b.dataset.a;
        closeSheet();
        if (a === 'editar') return formPartido(m);
        if (a === 'compactar') {
          await api(`/matches/${m.id}/compactar`, { method: 'POST' });
          toast('Números compactados');
          return router();
        }
        if (a === 'vaciar') {
          return confirmar('¿Sacar a todos los jugadores de este partido?', async () => {
            for (const r of m.roster) await api(`/matches/${m.id}/slots/${r.numero}`, { method: 'DELETE' });
            toast('Plantel vaciado');
            router();
          }, 'Sí, vaciar');
        }
        if (a === 'borrar') {
          return confirmar(`¿Borrar el partido vs ${m.rival}?`, async () => {
            await api('/matches/' + m.id, { method: 'DELETE' });
            location.hash = '#/partidos';
          });
        }
        if (a === 'copiar') {
          const ms = (await api('/matches')).filter((x) => x.id !== m.id && x.cargados > 0);
          if (!ms.length) return toast('No hay otros partidos con plantel cargado');
          openSheet('Copiar plantel de…', `<ul class="plist">${ms.map((x) => `
            <li data-c="${x.id}">
              <span class="ini">${x.equipo}</span>
              <span class="grow trunc"><span style="font-weight:600">vs ${esc(x.rival)}</span>
              <span class="muted" style="display:block">${fechaCorta(x.fecha_hora)} · ${x.cargados} jugadores</span></span>
            </li>`).join('')}</ul>`, (w2) => {
            w2.querySelectorAll('[data-c]').forEach((li) => {
              li.onclick = async () => {
                await api(`/matches/${m.id}/copiar/${li.dataset.c}`, { method: 'POST' });
                closeSheet();
                toast('Plantel copiado');
                router();
              };
            });
          });
        }
      };
    });
  });
}

/* ------------------------------------------------------------- exportar */

async function exportar(id, cual = 'plantel') {
  const datos = await api(`/matches/${id}/export`);
  let actual = cual;

  const w = openSheet('Mandar por WhatsApp', `
    <div class="segmento" style="margin-bottom:12px">
      <button data-v="plantel">Plantel</button>
      <button data-v="resumen">Resumen</button>
    </div>
    <div class="export-box" id="tx"></div>
    <div style="height:12px"></div>
    <button class="btn" data-wa>Enviar por WhatsApp</button>
    <div style="height:8px"></div>
    <button class="btn sec" data-copy>Copiar texto</button>
  `, (w) => {
    const caja = w.querySelector('#tx');
    const texto = () => datos[actual] || '';
    const pintar = () => {
      caja.textContent = texto();
      w.querySelectorAll('[data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === actual));
    };
    w.querySelectorAll('[data-v]').forEach((b) => {
      b.onclick = () => { actual = b.dataset.v; pintar(); };
    });
    w.querySelector('[data-wa]').onclick = () => {
      window.open('https://wa.me/?text=' + encodeURIComponent(texto()), '_blank');
    };
    w.querySelector('[data-copy]').onclick = async () => {
      try {
        await navigator.clipboard.writeText(texto());
        toast('Copiado');
      } catch {
        const r = document.createRange();
        r.selectNode(caja);
        getSelection().removeAllRanges();
        getSelection().addRange(r);
        document.execCommand('copy');
        toast('Copiado');
      }
    };
    pintar();
  });
  return w;
}

/* ------------------------------------------------------------ jugadores */

async function viewJugadores() {
  const q = viewJugadores._q || '';
  const js = await api('/players?todos=1' + (q ? '&q=' + encodeURIComponent(q) : ''));
  const activos = js.filter((p) => p.activo);
  const inactivos = js.filter((p) => !p.activo);

  const fila = (p) => `
    <div class="card tap" data-j="${p.id}" style="padding:11px 13px">
      <div class="row">
        <span class="ini" style="flex:0 0 38px;height:38px;border-radius:50%;background:var(--marca-claro);color:var(--marca);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px">${esc(iniciales(p))}</span>
        <span class="grow trunc">
          <span style="font-weight:600">${esc(nombreCompleto(p))}</span>
          <span class="muted trunc" style="display:block">${p.apodo ? esc(p.apodo) + ' · ' : ''}DNI ${esc(p.dni)}</span>
        </span>
      </div>
    </div>`;

  shell({
    titulo: 'Jugadores',
    sub: `${activos.length} activos`,
    tab: 'jugadores',
    fab: true,
    contenido: `
      <div class="search" style="margin-bottom:12px">${ICON.buscar}
        <input id="qj" placeholder="Buscar por apellido, nombre o apodo" value="${esc(q)}" autocomplete="off">
      </div>
      ${activos.map(fila).join('') || '<div class="empty">No hay jugadores cargados.</div>'}
      ${inactivos.length ? `<div class="sec-title">Inactivos</div>${inactivos.map(fila).join('')}` : ''}`,
  });

  const qi = $('#qj');
  qi.oninput = () => {
    clearTimeout(viewJugadores._t);
    viewJugadores._t = setTimeout(() => {
      viewJugadores._q = qi.value;
      viewJugadores().then(() => { const n = $('#qj'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); });
    }, 250);
  };
  $('[data-fab]').onclick = () => formJugador();
  app.querySelectorAll('[data-j]').forEach((el) => {
    el.onclick = () => formJugador(js.find((p) => p.id === Number(el.dataset.j)));
  });
}

function formJugador(p) {
  const ed = !!p;
  openSheet(ed ? 'Editar jugador' : 'Nuevo jugador', `
    <form id="fj">
      <label>Apellido</label><input name="apellido" required value="${esc(p ? p.apellido : '')}">
      <label>Nombre</label><input name="nombre" required value="${esc(p ? p.nombre : '')}">
      <label>DNI</label><input name="dni" required inputmode="numeric" value="${esc(p ? p.dni : '')}">
      <label>Apodo (opcional)</label><input name="apodo" value="${esc(p && p.apodo ? p.apodo : '')}">
      ${ed ? `<label style="margin-top:16px"><input type="checkbox" name="activo" ${p.activo ? 'checked' : ''} style="width:auto;margin-right:8px">Activo en el club</label>` : ''}
      <div style="height:18px"></div>
      <button class="btn" type="submit">Guardar</button>
      ${ed ? `<div style="height:8px"></div><button class="btn dan" type="button" data-del>Borrar jugador</button>` : ''}
    </form>
  `, (w) => {
    w.querySelector('#fj').onsubmit = async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      fd.activo = ed ? !!fd.activo : true;
      try {
        if (ed) await api('/players/' + p.id, { method: 'PUT', body: fd });
        else await api('/players', { method: 'POST', body: fd });
        CACHE_JUGADORES = null;
        closeSheet();
        toast('Jugador guardado');
        router();
      } catch (err) { toast(err.message, true); }
    };
    const del = w.querySelector('[data-del]');
    if (del) del.onclick = () => confirmar(`¿Borrar a ${nombreCompleto(p)}?`, async () => {
      const r = await api('/players/' + p.id, { method: 'DELETE' });
      CACHE_JUGADORES = null;
      closeSheet();
      toast(r.desactivado ? 'Estaba en partidos: quedó como inactivo' : 'Jugador borrado');
      router();
    });
  });
}

/* -------------------------------------------------------------- usuarios */

async function viewUsuarios() {
  const us = await api('/users');
  shell({
    titulo: 'Usuarios',
    sub: 'Todos con los mismos permisos',
    tab: 'usuarios',
    fab: true,
    contenido: us.map((u) => `
      <div class="card tap" data-u="${u.id}">
        <div class="row">
          <span class="grow trunc">
            <span style="font-weight:600">${esc(u.nombre)}</span>
            <span class="muted trunc" style="display:block">@${esc(u.username)}</span>
          </span>
          ${u.activo ? '' : '<span class="chip b">Inactivo</span>'}
          ${u.id === (ME && ME.id) ? '<span class="chip">Vos</span>' : ''}
        </div>
      </div>`).join(''),
  });
  $('[data-fab]').onclick = () => formUsuario();
  app.querySelectorAll('[data-u]').forEach((el) => {
    el.onclick = () => formUsuario(us.find((u) => u.id === Number(el.dataset.u)));
  });
}

function formUsuario(u) {
  const ed = !!u;
  openSheet(ed ? 'Editar usuario' : 'Nuevo usuario', `
    <form id="fu">
      <label>Nombre y apellido</label><input name="nombre" required value="${esc(u ? u.nombre : '')}">
      <label>Usuario</label><input name="username" required autocapitalize="none" value="${esc(u ? u.username : '')}">
      <label>Contraseña${ed ? ' (dejar vacío para no cambiarla)' : ''}</label>
      <input name="password" type="password" ${ed ? '' : 'required'} autocomplete="new-password">
      ${ed ? `<label style="margin-top:16px"><input type="checkbox" name="activo" ${u.activo ? 'checked' : ''} style="width:auto;margin-right:8px">Activo</label>` : ''}
      <div style="height:18px"></div>
      <button class="btn" type="submit">Guardar</button>
      ${ed && u.id !== (ME && ME.id) ? `<div style="height:8px"></div><button class="btn dan" type="button" data-del>Borrar usuario</button>` : ''}
    </form>
  `, (w) => {
    w.querySelector('#fu').onsubmit = async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      if (ed) fd.activo = !!fd.activo;
      if (ed && !fd.password) delete fd.password;
      try {
        if (ed) await api('/users/' + u.id, { method: 'PUT', body: fd });
        else await api('/users', { method: 'POST', body: fd });
        closeSheet();
        toast('Usuario guardado');
        router();
      } catch (err) { toast(err.message, true); }
    };
    const del = w.querySelector('[data-del]');
    if (del) del.onclick = () => confirmar(`¿Borrar el usuario ${u.username}?`, async () => {
      await api('/users/' + u.id, { method: 'DELETE' });
      closeSheet();
      router();
    });
  });
}

function menuCuenta() {
  openSheet(ME ? ME.nombre : 'Cuenta', `
    <button class="btn sec" data-pass>Cambiar mi contraseña</button>
    <div style="height:8px"></div>
    <button class="btn dan" data-out>Cerrar sesión</button>
  `, (w) => {
    w.querySelector('[data-out]').onclick = async () => {
      await api('/logout', { method: 'POST' });
      closeSheet();
      ME = null;
      renderLogin();
    };
    w.querySelector('[data-pass]').onclick = () => {
      closeSheet();
      openSheet('Cambiar contraseña', `
        <form id="fc">
          <label>Contraseña actual</label><input name="actual" type="password" required>
          <label>Contraseña nueva</label><input name="nueva" type="password" required minlength="6">
          <div style="height:18px"></div>
          <button class="btn" type="submit">Guardar</button>
        </form>`, (w2) => {
        w2.querySelector('#fc').onsubmit = async (e) => {
          e.preventDefault();
          try {
            await api('/me/password', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
            closeSheet();
            toast('Contraseña actualizada');
          } catch (err) { toast(err.message, true); }
        };
      });
    };
  });
}

/* --------------------------------------------------------- partido en vivo */

let TICK = null, POLL = null, WAKE = null;
let VIVO = null;         // último estado traído del servidor
let LADO = 'nosotros';   // equipo elegido en los botones de puntos
let ELEGIR_PARTIDO = false;

function pararTimers() {
  if (TICK) { clearInterval(TICK); TICK = null; }
  if (POLL) { clearInterval(POLL); POLL = null; }
  if (WAKE) { try { WAKE.release(); } catch (e) {} WAKE = null; }
}

function mmss(seg) {
  seg = Math.max(0, Math.floor(seg));
  return `${String(Math.floor(seg / 60)).padStart(2, '0')}:${String(seg % 60).padStart(2, '0')}`;
}

// Segundos del período, calculados contra el reloj del servidor
function segundosActuales(v) {
  const p = v.partido;
  const desfase = v.recibido - v.ahora;
  const extra = p.reloj_corriendo && p.reloj_desde
    ? Math.floor((Date.now() - desfase - p.reloj_desde) / 1000)
    : 0;
  return p.reloj_base_seg + extra;
}
function absActual(v) {
  return (v.partido.periodo >= 2 ? v.partido.primer_tiempo_seg : 0) + segundosActuales(v);
}
function nombrePeriodo(p) {
  return p.periodo === 0 ? 'Sin comenzar'
    : p.periodo === 1 ? '1er tiempo'
    : p.periodo === 2 ? '2do tiempo' : 'Final';
}
function minutoDe(e) { return Math.floor(e.t_abs / 60) + 1; }
function nombreCorto() { return CLUB.split(' ')[0]; }

async function pedirWakeLock() {
  try {
    if ('wakeLock' in navigator) WAKE = await navigator.wakeLock.request('screen');
  } catch (e) { /* no pasa nada si el navegador no lo permite */ }
}

/* ------------------------------------------------------------- vista */

async function viewVivo(id) {
  const partidos = await api('/matches');
  if (ELEGIR_PARTIDO) { ELEGIR_PARTIDO = false; return elegirPartidoVivo(partidos); }
  if (!id) {
    const enCurso = partidos.find((m) => m.estado === 'en_curso');
    if (enCurso) id = enCurso.id;
  }
  if (!id) return elegirPartidoVivo(partidos);

  const [v, det] = await Promise.all([api('/matches/' + id + '/vivo'), api('/matches/' + id)]);
  v.recibido = Date.now();
  v.roster = det.roster;
  VIVO = v;
  pintarVivo();
  TICK = setInterval(tickVivo, 1000);
  POLL = setInterval(sincronizar, 8000);
  pedirWakeLock();
}

function elegirPartidoVivo(partidos) {
  const candidatos = partidos.filter((m) => m.estado !== 'finalizado');
  shell({
    titulo: 'En vivo',
    sub: 'Seguimiento del partido',
    tab: 'vivo',
    contenido: candidatos.length
      ? `<div class="sec-title">Elegí el partido a seguir</div>` + candidatos.map((m) => `
          <div class="card tap" data-ir="${m.id}">
            <div class="row">
              <span class="chip ${m.equipo === 'B' ? 'b' : ''}">Equipo ${m.equipo}</span>
              <div class="grow"></div>
              <span class="muted">${m.cargados}/25</span>
            </div>
            <div style="font-weight:650;font-size:17px;margin:7px 0 2px" class="trunc">vs ${esc(m.rival)}</div>
            <div class="muted trunc">${fechaCorta(m.fecha_hora)}${m.lugar ? ' · ' + esc(m.lugar) : ''}</div>
          </div>`).join('')
      : `<div class="empty">No hay partidos para seguir.<br>Creá uno desde la pestaña Partidos.</div>`,
  });
  app.querySelectorAll('[data-ir]').forEach((el) => {
    el.onclick = () => { location.hash = '#/vivo/' + el.dataset.ir; };
  });
}

function firma(v) {
  return [v.partido.estado, v.partido.periodo, v.partido.reloj_corriendo, v.partido.reloj_base_seg,
    v.partido.reloj_desde, v.partido.primer_tiempo_seg, v.eventos.length,
    v.marcador.nosotros, v.marcador.rival].join('|');
}

async function sincronizar() {
  if (!VIVO) return;
  try {
    const nuevo = await api('/matches/' + VIVO.partido.id + '/vivo');
    if (firma(nuevo) === firma(VIVO)) { VIVO.ahora = nuevo.ahora; VIVO.recibido = Date.now(); return; }
    aplicar(nuevo);
  } catch (e) { /* si se cae la red, seguimos con lo que tenemos */ }
}

function aplicar(nuevo) {
  nuevo.recibido = Date.now();
  nuevo.roster = VIVO ? VIVO.roster : [];
  VIVO = nuevo;
  pintarVivo();
}

// Solo refresca los números que corren, sin volver a dibujar la pantalla
function tickVivo() {
  if (!VIVO) return;
  const r = $('#reloj');
  if (r) r.textContent = mmss(segundosActuales(VIVO));
  const abs = absActual(VIVO);
  app.querySelectorAll('[data-tarjeta]').forEach((el) => {
    const t = VIVO.tarjetas.find((x) => String(x.id) === el.dataset.tarjeta);
    if (!t || t.tipo === 'roja') return;
    const queda = Math.max(0, DUR_AMARILLA - (abs - VIVO.eventos.find((e) => e.id === t.id).t_abs));
    el.textContent = queda > 0 ? mmss(queda) : 'cumplida';
    el.classList.toggle('ok', queda === 0);
  });
}

function pintarVivo() {
  const v = VIVO, p = v.partido;
  const corriendo = !!p.reloj_corriendo;
  const terminado = p.estado === 'finalizado';
  const abs = absActual(v);

  const activas = v.tarjetas.filter((t) => t.tipo === 'roja' || t.restante > 0);
  const eventos = v.eventos.slice().reverse();

  const botonPeriodo = terminado
    ? `<button class="btn sec" data-reabrir>Reabrir partido</button>`
    : p.periodo <= 1
      ? `<button class="btn sec" data-finperiodo>Fin del 1er tiempo</button>`
      : `<button class="btn sec" data-finperiodo>Fin del partido</button>`;

  shell({
    titulo: 'En vivo',
    sub: `Equipo ${p.equipo} vs ${p.rival}`,
    tab: 'vivo',
    acciones: `<button data-menu aria-label="Opciones">&#8942;</button>`,
    contenido: `
      <div class="marcador">
        <div class="lado">
          <span class="eq trunc">${esc(nombreCorto())}</span>
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
          <span class="muted">${corriendo ? 'corriendo' : terminado ? 'terminado' : 'detenido'}</span>
        </div>
        <div id="reloj" class="reloj ${corriendo ? 'on' : ''}">${mmss(segundosActuales(v))}</div>
        <div class="two">
          ${terminado ? '' : `<button class="btn ${corriendo ? 'dan' : ''}" data-toggle>${corriendo ? '⏸ Parar' : '▶ Arrancar'}</button>`}
          ${botonPeriodo}
        </div>
      </div>

      ${activas.length ? `
        <div class="sec-title">Tarjetas</div>
        ${activas.map((t) => `
          <div class="card" style="padding:11px 13px">
            <div class="row">
              <span class="tarj ${t.tipo}"></span>
              <span class="grow trunc">
                <span style="font-weight:600">${t.equipo === 'rival' ? esc(p.rival) : (t.apellido ? esc(t.apellido + ', ' + t.nombre) : 'Sin jugador')}</span>
                <span class="muted" style="display:block">${t.tipo === 'roja' ? 'Expulsado' : 'Amarilla'} · min ${t.minuto}</span>
              </span>
              <span class="cuenta ${t.tipo === 'roja' ? 'ok' : ''}" data-tarjeta="${t.id}">${t.tipo === 'roja' ? 'expulsado' : mmss(t.restante)}</span>
            </div>
          </div>`).join('')}` : ''}

      ${(v.penales.nosotros || v.penales.rival) ? `
        <div class="sec-title">Penales cometidos</div>
        <div class="card">
          <div class="row">
            <div class="lado-penal">
              <span class="muted trunc">${esc(nombreCorto())}</span>
              <strong>${v.penales.nosotros}</strong>
            </div>
            <div class="lado-penal">
              <span class="muted trunc">${esc(p.rival)}</span>
              <strong>${v.penales.rival}</strong>
            </div>
          </div>
          ${v.penales.porTipo.length ? `<div class="progreso" style="margin:12px 0 0">
            ${v.penales.porTipo.map(([t, n]) => `<span class="chip">${esc(t)} ${n}</span>`).join('')}
          </div>` : ''}
          ${v.penales.porJugador.length ? `<div class="muted" style="margin-top:10px">
            ${v.penales.porJugador.map(([j, n]) => `${esc(j)}: ${n}`).join(' · ')}
          </div>` : ''}
        </div>` : ''}

      <div class="sec-title">Cargar</div>
      <div class="segmento">
        <button data-lado="nosotros" class="${LADO === 'nosotros' ? 'on' : ''}">${esc(nombreCorto())}</button>
        <button data-lado="rival" class="${LADO === 'rival' ? 'on' : ''}">${esc(p.rival)}</button>
      </div>
      <div class="grid-puntos">
        ${TIPOS_PUNTO.map((t) => `
          <button class="btn punto" data-punto="${t.k}">
            <span>${t.n}</span><small>+${t.p}</small>
          </button>`).join('')}
        <button class="btn punto tarjeta" data-penal>
          <span>Penal cometido</span><small>${LADO === 'rival' ? esc(p.rival) : 'elegís el tipo'}</small>
        </button>
        <button class="btn punto tarjeta" data-tarj>
          <span>Tarjeta</span><small>🟨 🟥</small>
        </button>
      </div>

      <div class="sec-title">Cronología</div>
      ${eventos.length ? eventos.map((e) => `
        <div class="card evento" style="padding:10px 12px">
          <div class="row">
            <span class="min">${minutoDe(e)}'</span>
            <span class="grow trunc">
              <span style="font-weight:600">${esc(NOMBRE_TIPO[e.tipo])}${e.detalle ? ` <span class="muted">· ${esc(e.detalle)}</span>` : ''}${e.puntos ? ` <span class="muted">+${e.puntos}</span>` : ''}</span>
              <span class="muted trunc" style="display:block">${e.equipo === 'rival' ? esc(p.rival) : (e.apellido ? esc(e.nombre + ' ' + e.apellido) : esc(nombreCorto()))}</span>
            </span>
            <button class="x" data-borrar="${e.id}" aria-label="Borrar">&times;</button>
          </div>
        </div>`).join('') : '<div class="muted" style="padding:4px 6px 12px">Todavía no se cargó nada.</div>'}

      <div style="height:6px"></div>
      <button class="btn sec" data-compartir>Compartir resultado o enlace</button>
      <div style="height:8px"></div>
      <button class="btn sec" data-resumen>Exportar resumen</button>
      <div style="height:8px"></div>
      <button class="btn sec" data-plantel>Ver el plantel</button>
    `,
  });

  const tog = $('[data-toggle]');
  if (tog) tog.onclick = () => accionReloj(corriendo ? 'pausar' : 'iniciar');
  const fp = $('[data-finperiodo]');
  if (fp) fp.onclick = () => confirmar(
    p.periodo <= 1 ? '¿Terminar el primer tiempo?' : '¿Terminar el partido?',
    () => accionReloj('fin_periodo'), 'Sí, terminar');
  const rab = $('[data-reabrir]');
  if (rab) rab.onclick = () => accionReloj('reabrir');

  app.querySelectorAll('[data-lado]').forEach((b) => {
    b.onclick = () => { LADO = b.dataset.lado; pintarVivo(); };
  });
  app.querySelectorAll('[data-punto]').forEach((b) => {
    b.onclick = () => tocarPunto(b.dataset.punto);
  });
  $('[data-tarj]').onclick = () => sheetTarjeta();
  $('[data-penal]').onclick = () => tocarPenal();
  app.querySelectorAll('[data-borrar]').forEach((b) => {
    b.onclick = () => confirmar('¿Borrar esta acción?', async () => {
      aplicar(await api(`/matches/${p.id}/eventos/${b.dataset.borrar}`, { method: 'DELETE' }));
      toast('Borrado');
    });
  });
  $('[data-resumen]').onclick = () => exportar(p.id, 'resumen');
  $('[data-compartir]').onclick = () => sheetCompartir(p.id);
  $('[data-plantel]').onclick = () => { location.hash = '#/partido/' + p.id; };
  $('[data-menu]').onclick = () => menuVivo();
}

/* ------------------------------------------------------------ acciones */

async function accionReloj(accion, extra = {}) {
  try {
    aplicar(await api(`/matches/${VIVO.partido.id}/reloj`, { method: 'POST', body: { accion, ...extra } }));
  } catch (err) { toast(err.message, true); }
}

async function cargarEvento(tipo, equipo, playerId, detalle) {
  try {
    aplicar(await api(`/matches/${VIVO.partido.id}/eventos`, {
      method: 'POST', body: { tipo, equipo, player_id: playerId || null, detalle: detalle || null },
    }));
    toast(detalle ? `${detalle} cargado` : `${NOMBRE_TIPO[tipo]} cargado`);
  } catch (err) { toast(err.message, true); }
}

function tocarPunto(tipo) {
  if (LADO === 'rival') return cargarEvento(tipo, 'rival', null);
  elegirJugadorVivo(`${NOMBRE_TIPO[tipo]} · ¿quién?`, (pid) => cargarEvento(tipo, 'nosotros', pid));
}

// Penal cometido: del rival se cuenta y listo; el nuestro pide tipo y jugador
function tocarPenal() {
  if (LADO === 'rival') return cargarEvento('infraccion', 'rival', null);
  openSheet('¿Qué penal fue?', `
    <div class="grid-penales">
      ${TIPOS_PENAL.map((t) => `<button class="btn sec" data-tp="${esc(t)}">${esc(t)}</button>`).join('')}
    </div>
  `, (w) => {
    w.querySelectorAll('[data-tp]').forEach((b) => {
      b.onclick = () => {
        const detalle = b.dataset.tp;
        closeSheet();
        elegirJugadorVivo(`${detalle} · ¿quién?`, (pid) =>
          cargarEvento('infraccion', 'nosotros', pid, detalle));
      };
    });
  });
}

function sheetTarjeta() {
  openSheet('Tarjeta', `
    <button class="btn sec" data-t="amarilla-nosotros">🟨 Amarilla · ${esc(nombreCorto())}</button><div style="height:8px"></div>
    <button class="btn sec" data-t="roja-nosotros">🟥 Roja · ${esc(nombreCorto())}</button><div style="height:8px"></div>
    <button class="btn sec" data-t="amarilla-rival">🟨 Amarilla · ${esc(VIVO.partido.rival)}</button><div style="height:8px"></div>
    <button class="btn sec" data-t="roja-rival">🟥 Roja · ${esc(VIVO.partido.rival)}</button>
  `, (w) => {
    w.querySelectorAll('[data-t]').forEach((b) => {
      b.onclick = () => {
        const [tipo, equipo] = b.dataset.t.split('-');
        closeSheet();
        if (equipo === 'rival') return cargarEvento(tipo, 'rival', null);
        elegirJugadorVivo(`${NOMBRE_TIPO[tipo]} · ¿a quién?`, (pid) => cargarEvento(tipo, 'nosotros', pid));
      };
    });
  });
}

// Selector rápido: primero los del plantel (por número), con buscador
async function elegirJugadorVivo(titulo, onPick) {
  let lista = (VIVO.roster || []).map((r) => ({ ...r, id: r.player_id, numero: r.numero }));
  if (!lista.length) {
    if (!CACHE_JUGADORES) CACHE_JUGADORES = await api('/players');
    lista = CACHE_JUGADORES.map((p) => ({ ...p, numero: null }));
  }

  const w = openSheet(titulo, `<ul class="plist" id="lista"></ul>`, null, {
    alta: true,
    sticky: `<div class="search">${ICON.buscar}
      <input id="q" placeholder="Buscar o dejar sin jugador" autocomplete="off" enterkeyhint="done">
    </div>`,
  });
  const input = w.querySelector('#q');
  const cont = w.querySelector('#lista');

  const pintar = () => {
    const q = norm(input.value.trim());
    const items = q
      ? lista.filter((p) => norm(p.apellido).includes(q) || norm(p.nombre).includes(q) ||
          norm(p.apodo).includes(q) || String(p.numero || '') === q)
      : lista;
    cont.innerHTML =
      `<li data-sin style="border-bottom:1px solid var(--line)">
         <span class="ini" style="background:var(--line);color:var(--txt-2)">—</span>
         <span class="grow" style="font-weight:600">Sin jugador</span>
       </li>` +
      items.map((p) => `
        <li data-p="${p.id}">
          <span class="ini">${p.numero ? p.numero : esc(iniciales(p))}</span>
          <span class="grow trunc">
            <span style="font-weight:600">${esc(nombreCompleto(p))}</span>
            <span class="muted trunc" style="display:block">${p.apodo ? esc(p.apodo) + ' · ' : ''}${p.numero ? posicion(p.numero) : 'Fuera del plantel'}</span>
          </span>
        </li>`).join('');
    cont.querySelector('[data-sin]').onclick = () => { closeSheet(); onPick(null); };
    cont.querySelectorAll('[data-p]').forEach((li) => {
      li.onclick = () => { closeSheet(); onPick(Number(li.dataset.p)); };
    });
  };
  input.addEventListener('input', pintar);
  pintar();
  setTimeout(() => input.focus(), 120);
}

function menuVivo() {
  const p = VIVO.partido;
  openSheet('Opciones del seguimiento', `
    <button class="btn sec" data-a="ajustar">Corregir el reloj</button><div style="height:8px"></div>
    <button class="btn sec" data-a="finalizar">Dar por finalizado</button><div style="height:8px"></div>
    <button class="btn sec" data-a="cambiar">Seguir otro partido</button><div style="height:8px"></div>
    <button class="btn dan" data-a="reiniciar">Reiniciar el seguimiento</button>
  `, (w) => {
    w.querySelectorAll('[data-a]').forEach((b) => {
      b.onclick = () => {
        const a = b.dataset.a;
        closeSheet();
        if (a === 'finalizar') return confirmar('¿Dar el partido por finalizado?', () => accionReloj('finalizar'), 'Sí, finalizar');
        if (a === 'cambiar') { VIVO = null; ELEGIR_PARTIDO = true; location.hash = '#/vivo'; return router(); }
        if (a === 'reiniciar') return confirmar(
          'Vuelve el reloj a cero y el partido a "sin comenzar". Las acciones cargadas NO se borran.',
          () => accionReloj('reiniciar'), 'Sí, reiniciar');
        if (a === 'ajustar') {
          const seg = segundosActuales(VIVO);
          openSheet('Corregir el reloj', `
            <p class="muted" style="margin-top:0">Minutos y segundos jugados del ${nombrePeriodo(p).toLowerCase()}.</p>
            <div class="two">
              <div><label>Minutos</label><input id="mm" type="number" min="0" max="120" value="${Math.floor(seg / 60)}"></div>
              <div><label>Segundos</label><input id="ss" type="number" min="0" max="59" value="${seg % 60}"></div>
            </div>
            <div style="height:18px"></div>
            <button class="btn" data-ok>Guardar</button>
          `, (w2) => {
            w2.querySelector('[data-ok]').onclick = () => {
              const s = (Number(w2.querySelector('#mm').value) || 0) * 60 + (Number(w2.querySelector('#ss').value) || 0);
              closeSheet();
              accionReloj('ajustar', { segundos: s });
            };
          });
        }
      };
    });
  });
}


/* ------------------------------------------------------- compartir */

// Dibuja la placa del resultado: marcador y cronología, sin penales cometidos.
async function imagenResultado(v) {
  const p = v.partido;
  const club = v.club || CLUB;
  const eventos = v.eventos.filter((e) => e.tipo !== 'infraccion');
  const filas = eventos.slice(-16);
  const sobran = eventos.length - filas.length;

  const W = 1080;
  const ALTO_FILA = 64;
  const TOPE = 660;
  const H = Math.max(1080, TOPE + filas.length * ALTO_FILA + (sobran > 0 ? 50 : 0) + 90);

  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  const AZUL = '#1d2450', AZUL2 = '#293263';
  const BLANCO = '#ffffff', TENUE = '#a8b0d4', ROSA = '#d98cb0';
  const FUENTE = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

  const fondo = g.createLinearGradient(0, 0, 0, H);
  fondo.addColorStop(0, AZUL2);
  fondo.addColorStop(1, AZUL);
  g.fillStyle = fondo;
  g.fillRect(0, 0, W, H);

  const recortar = (txt, max) => {
    let t = String(txt || '');
    if (g.measureText(t).width <= max) return t;
    while (t.length > 1 && g.measureText(t + '…').width > max) t = t.slice(0, -1);
    return t + '…';
  };

  // escudo, sobre un disco blanco para que no se pierda contra el azul
  try {
    const logo = new Image();
    logo.src = '/logo.png';
    await logo.decode();
    g.fillStyle = BLANCO;
    g.beginPath();
    g.arc(116, 108, 58, 0, Math.PI * 2);
    g.fill();
    g.drawImage(logo, 64, 56, 104, 104);
  } catch (e) { /* si no carga, seguimos sin escudo */ }

  g.textBaseline = 'alphabetic';
  g.fillStyle = BLANCO;
  g.font = `700 40px ${FUENTE}`;
  g.fillText(recortar(club.toUpperCase(), 780), 196, 100);
  g.fillStyle = TENUE;
  g.font = `400 30px ${FUENTE}`;
  g.fillText(recortar(`Equipo ${p.equipo} · ${fechaCorta(p.fecha_hora)}${p.lugar ? ' · ' + p.lugar : ''}`, 800), 196, 146);

  // marcador
  const yEq = 300, yPts = 430;
  g.textAlign = 'center';
  g.font = `700 38px ${FUENTE}`;
  g.fillStyle = TENUE;
  g.fillText(recortar(nombreCorto().toUpperCase(), 400), 280, yEq);
  g.fillText(recortar(String(p.rival).toUpperCase(), 400), 800, yEq);

  g.fillStyle = BLANCO;
  g.font = `800 150px ${FUENTE}`;
  g.fillText(String(v.marcador.nosotros), 280, yPts);
  g.fillText(String(v.marcador.rival), 800, yPts);
  g.fillStyle = TENUE;
  g.font = `300 96px ${FUENTE}`;
  g.fillText('–', 540, yPts - 14);

  // estado
  const etiqueta = p.estado === 'finalizado'
    ? 'FINAL'
    : p.estado === 'en_curso' ? `EN JUEGO · ${nombrePeriodo(p)}` : 'SIN COMENZAR';
  g.font = `700 30px ${FUENTE}`;
  const anchoChip = g.measureText(etiqueta).width + 60;
  const xChip = (W - anchoChip) / 2;
  g.fillStyle = p.estado === 'finalizado' ? 'rgba(255,255,255,.14)' : ROSA;
  g.beginPath();
  g.roundRect(xChip, 480, anchoChip, 58, 29);
  g.fill();
  g.fillStyle = p.estado === 'finalizado' ? BLANCO : AZUL;
  g.fillText(etiqueta, W / 2, 519);

  // cronología
  g.textAlign = 'left';
  g.fillStyle = TENUE;
  g.font = `700 26px ${FUENTE}`;
  g.fillText('CRONOLOGÍA', 64, 610);
  g.strokeStyle = 'rgba(255,255,255,.14)';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(64, 630); g.lineTo(W - 64, 630); g.stroke();

  let y = TOPE + 30;
  for (const e of filas) {
    const nuestro = e.equipo !== 'rival';
    g.fillStyle = nuestro ? ROSA : 'rgba(255,255,255,.35)';
    g.beginPath();
    g.arc(78, y - 10, 9, 0, Math.PI * 2);
    g.fill();

    g.fillStyle = TENUE;
    g.font = `700 30px ${FUENTE}`;
    g.fillText(`${Math.floor(e.t_abs / 60) + 1}'`, 108, y);

    g.fillStyle = BLANCO;
    g.font = `600 32px ${FUENTE}`;
    const quien = nuestro
      ? (e.apellido ? `${e.nombre} ${e.apellido}` : nombreCorto())
      : p.rival;
    const texto = `${NOMBRE_TIPO[e.tipo] || e.tipo} — ${quien}`;
    g.fillText(recortar(texto, W - 300), 200, y);

    if (e.puntos) {
      g.textAlign = 'right';
      g.fillStyle = TENUE;
      g.font = `700 30px ${FUENTE}`;
      g.fillText(`+${e.puntos}`, W - 64, y);
      g.textAlign = 'left';
    }
    y += ALTO_FILA;
  }
  if (sobran > 0) {
    g.fillStyle = TENUE;
    g.font = `400 28px ${FUENTE}`;
    g.fillText(`y ${sobran} acciones más`, 108, y + 6);
  }

  g.textAlign = 'center';
  g.fillStyle = 'rgba(255,255,255,.35)';
  g.font = `600 26px ${FUENTE}`;
  g.fillText(club.toUpperCase(), W / 2, H - 46);

  return new Promise((r) => c.toBlob(r, 'image/png'));
}

function tituloPartido(v) {
  const p = v.partido;
  return `${nombreCorto()} ${v.marcador.nosotros} - ${v.marcador.rival} ${p.rival}`;
}

async function sheetCompartir(matchId) {
  const v = await api('/matches/' + matchId + '/vivo');
  v.recibido = Date.now();
  const p = v.partido;

  const w = openSheet('Compartir', `
    <div id="prev-caja">
      <div class="muted" style="padding:20px 0;text-align:center">Armando la imagen…</div>
    </div>
    <button class="btn" data-img>Compartir imagen</button>
    <div style="height:8px"></div>
    <button class="btn sec" data-bajar>Descargar imagen</button>

    <div class="sec-title">Seguimiento en vivo</div>
    <p class="muted" style="margin:0 0 12px">
      Un enlace para que cualquiera vea el tiempo, el resultado y la cronología.
      No pueden tocar nada, y los penales cometidos no se muestran.
    </p>
    <div id="enlace-caja"></div>
  `, null, { alta: true });

  /* --- imagen --- */
  let blob = null;
  const caja = w.querySelector('#prev-caja');
  imagenResultado(v).then((b) => {
    blob = b;
    const url = URL.createObjectURL(b);
    caja.innerHTML = `<img src="${url}" alt="Resultado" class="preview-img">`;
  }).catch(() => {
    caja.innerHTML = '<div class="muted">No se pudo generar la imagen.</div>';
  });

  w.querySelector('[data-img]').onclick = async () => {
    if (!blob) return toast('Esperá un segundo, se está generando', true);
    const file = new File([blob], 'resultado.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: tituloPartido(v) });
      } catch (e) { /* si cancela, no pasa nada */ }
    } else {
      bajarImagen(blob);
      toast('Imagen descargada: compartila desde la galería');
    }
  };
  w.querySelector('[data-bajar]').onclick = () => {
    if (blob) bajarImagen(blob);
  };

  /* --- enlace --- */
  const cajaEnlace = w.querySelector('#enlace-caja');
  const pintarEnlace = (token) => {
    if (!token) {
      cajaEnlace.innerHTML = `<button class="btn sec" data-crear>Crear enlace para compartir</button>`;
      cajaEnlace.querySelector('[data-crear]').onclick = async () => {
        const r = await api(`/matches/${matchId}/compartir`, { method: 'POST' });
        pintarEnlace(r.token);
        toast('Enlace creado');
      };
      return;
    }
    const url = location.origin + '/v/' + token;
    cajaEnlace.innerHTML = `
      <div class="export-box" style="max-height:none">${esc(url)}</div>
      <div style="height:10px"></div>
      <button class="btn" data-wa>Mandar el enlace por WhatsApp</button>
      <div style="height:8px"></div>
      <button class="btn sec" data-copiar>Copiar enlace</button>
      <div style="height:8px"></div>
      <button class="btn dan" data-baja>Dar de baja el enlace</button>`;
    cajaEnlace.querySelector('[data-wa]').onclick = () => {
      const txt = `Seguí en vivo ${nombreCorto()} vs ${p.rival}: ${url}`;
      window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank');
    };
    cajaEnlace.querySelector('[data-copiar]').onclick = async () => {
      try { await navigator.clipboard.writeText(url); toast('Copiado'); }
      catch { toast('Copialo a mano desde el recuadro', true); }
    };
    cajaEnlace.querySelector('[data-baja]').onclick = () => confirmar(
      'El enlace deja de funcionar para todos los que lo tengan. ¿Seguro?',
      async () => {
        await api(`/matches/${matchId}/compartir`, { method: 'DELETE' });
        pintarEnlace(null);
        toast('Enlace dado de baja');
      }, 'Sí, dar de baja');
  };
  pintarEnlace(p.share_token);
}

function bajarImagen(blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'resultado.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ------------------------------------------------------------------ router */

async function router() {
  pararTimers();
  if (!ME) {
    try { ME = (await api('/me')).user; }
    catch { return renderLogin(); }
  }
  const h = location.hash || '#/partidos';
  try {
    if (h.startsWith('#/vivo/')) return await viewVivo(h.split('/')[2]);
    if (h.startsWith('#/vivo')) return await viewVivo();
    if (h.startsWith('#/partido/')) return await viewPartido(h.split('/')[2]);
    if (h.startsWith('#/jugadores')) return await viewJugadores();
    if (h.startsWith('#/usuarios')) return await viewUsuarios();
    return await viewPartidos();
  } catch (err) {
    if (err.message !== 'Sesión vencida') toast(err.message, true);
  }
}

/* Teclado virtual: mantiene los paneles dentro del área visible.
   Sin esto, en el celular el teclado tapa la lista de jugadores.
   Importante: anclamos el panel directo al alto/offset real de
   visualViewport (--vh/--vtop) en vez de restar una diferencia
   calculada contra window.innerHeight. Esa resta duplicaba la
   corrección en Chrome porque index.html ya usa
   "interactive-widget=resizes-content" (el navegador achica solo
   la ventana), y las dos correcciones peleaban entre sí: al
   reabrir el buscador con el teclado ya arriba, el panel quedaba
   con la altura mal calculada y aparecía pegado contra el teclado
   sin lugar para los resultados. Anclar a vv.height/vv.offsetTop
   funciona igual haya o no resize nativo, y también en iOS Safari
   (que ignora ese meta tag).
   --kb se mantiene solo para el toast, que no necesita tanta
   precisión. */
function ajustarTeclado() {
  const vv = window.visualViewport;
  if (!vv) return;
  document.documentElement.style.setProperty('--vh', vv.height + 'px');
  document.documentElement.style.setProperty('--vtop', Math.round(vv.offsetTop) + 'px');
  const tapado = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  document.documentElement.style.setProperty('--kb', Math.round(tapado) + 'px');
}
if (window.visualViewport) {
  visualViewport.addEventListener('resize', ajustarTeclado);
  visualViewport.addEventListener('scroll', ajustarTeclado);
  ajustarTeclado();
}

window.addEventListener('hashchange', () => { sheetRoot.innerHTML = ''; document.body.style.overflow = ''; router(); });
router();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
