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
  const proximos = ms.filter((m) => esFuturo(m.fecha_hora));
  const pasados = ms.filter((m) => !esFuturo(m.fecha_hora));

  const tarjeta = (m) => `
    <div class="card tap" data-id="${m.id}">
      <div class="row">
        <span class="chip ${m.equipo === 'B' ? 'b' : ''}">Equipo ${m.equipo}</span>
        <div class="grow"></div>
        <span class="muted">${m.cargados}/25</span>
      </div>
      <div style="font-weight:650;font-size:17px;margin:7px 0 2px" class="trunc">vs ${esc(m.rival)}</div>
      <div class="muted trunc">${fechaCorta(m.fecha_hora)}${m.lugar ? ' · ' + esc(m.lugar) : ''}</div>
    </div>`;

  const contenido = !ms.length
    ? `<div class="empty">Todavía no hay partidos.<br>Tocá el botón + para crear el primero.</div>`
    : `${proximos.length ? `<div class="sec-title">Próximos</div>${proximos.map(tarjeta).join('')}` : ''}
       ${pasados.length ? `<div class="sec-title">Anteriores</div>${pasados.map(tarjeta).join('')}` : ''}`;

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
    el.onclick = () => { location.hash = '#/partido/' + el.dataset.id; };
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
    <button class="btn sec" data-exportar>Exportar para WhatsApp</button>
    ${bloques}`;

  shell({
    titulo: `Equipo ${m.equipo} vs ${m.rival}`,
    sub: fechaCorta(m.fecha_hora) + (m.lugar ? ' · ' + m.lugar : ''),
    back: true,
    contenido,
    tab: 'partidos',
    acciones: `<button data-menu aria-label="Opciones">&#8942;</button>`,
  });

  const refrescar = (roster) => { m.roster = roster; viewPartidoRepintar(m); };

  $('[data-agregar]').onclick = () => abrirSelector(m, siguienteLibre(m), refrescar, true);
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

async function exportar(id) {
  const { texto } = await api(`/matches/${id}/export`);
  openSheet('Listado para WhatsApp', `
    <div class="export-box" id="tx">${esc(texto)}</div>
    <div style="height:12px"></div>
    <button class="btn" data-wa>Enviar por WhatsApp</button>
    <div style="height:8px"></div>
    <button class="btn sec" data-copy>Copiar texto</button>
  `, (w) => {
    w.querySelector('[data-wa]').onclick = () => {
      window.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank');
    };
    w.querySelector('[data-copy]').onclick = async () => {
      try {
        await navigator.clipboard.writeText(texto);
        toast('Copiado');
      } catch {
        const r = document.createRange();
        r.selectNode(w.querySelector('#tx'));
        getSelection().removeAllRanges();
        getSelection().addRange(r);
        document.execCommand('copy');
        toast('Copiado');
      }
    };
  });
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

/* ------------------------------------------------------------------ router */

async function router() {
  if (!ME) {
    try { ME = (await api('/me')).user; }
    catch { return renderLogin(); }
  }
  const h = location.hash || '#/partidos';
  try {
    if (h.startsWith('#/partido/')) return await viewPartido(h.split('/')[2]);
    if (h.startsWith('#/jugadores')) return await viewJugadores();
    if (h.startsWith('#/usuarios')) return await viewUsuarios();
    return await viewPartidos();
  } catch (err) {
    if (err.message !== 'Sesión vencida') toast(err.message, true);
  }
}

/* Teclado virtual: mantiene los paneles dentro del área visible.
   Sin esto, en el celular el teclado tapa la lista de jugadores. */
function ajustarTeclado() {
  const vv = window.visualViewport;
  if (!vv) return;
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
