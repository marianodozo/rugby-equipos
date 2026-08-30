'use strict';

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 8090;
const HOST = process.env.HOST || '127.0.0.1';
const SESSION_DAYS = Number(process.env.SESSION_DAYS || 90);
const SECURE_COOKIE = String(process.env.SECURE_COOKIE || 'true') === 'true';
const CLUB = process.env.CLUB_NOMBRE || 'Barceló Rugby';

app.set('trust proxy', 1);
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: false }));

/* ---------------------------------------------------------------- helpers */

const TITULARES = 15;
const SUPLENTES = 8;
const ADICIONALES = 2;
const TOTAL_SLOTS = TITULARES + SUPLENTES + ADICIONALES; // 25

function grupoDe(numero) {
  if (numero <= TITULARES) return 'titular';
  if (numero <= TITULARES + SUPLENTES) return 'suplente';
  return 'adicional';
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setSessionCookie(res, token) {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  const bits = [
    `sid=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (SECURE_COOKIE) bits.push('Secure');
  res.setHeader('Set-Cookie', bits.join('; '));
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

function auth(req, res, next) {
  const token = parseCookies(req).sid;
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  const row = db
    .prepare(
      `SELECT s.token, u.id, u.username, u.nombre
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token = ? AND s.expires_at > datetime('now') AND u.activo = 1`
    )
    .get(token);
  if (!row) return res.status(401).json({ error: 'Sesión vencida' });
  req.user = { id: row.id, username: row.username, nombre: row.nombre };
  next();
}

function clean(v) {
  return typeof v === 'string' ? v.trim() : v;
}

function wrap(fn) {
  return (req, res) => {
    try {
      fn(req, res);
    } catch (err) {
      if (err && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ error: 'Ya existe un registro con esos datos' });
      }
      console.error(err);
      res.status(500).json({ error: 'Error interno' });
    }
  };
}

/* ------------------------------------------------------------------- auth */

app.post(
  '/api/login',
  wrap((req, res) => {
    const username = clean(req.body.username || '');
    const password = req.body.password || '';
    if (!username || !password)
      return res.status(400).json({ error: 'Usuario y contraseña son obligatorios' });

    const user = db
      .prepare('SELECT * FROM users WHERE username = ? AND activo = 1')
      .get(username);
    if (!user || !bcrypt.compareSync(password, user.password_hash))
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });

    const token = crypto.randomBytes(32).toString('hex');
    db.prepare(
      `INSERT INTO sessions (token, user_id, expires_at)
       VALUES (?, ?, datetime('now', '+' || ? || ' days'))`
    ).run(token, user.id, SESSION_DAYS);
    setSessionCookie(res, token);
    res.json({ user: { id: user.id, username: user.username, nombre: user.nombre } });
  })
);

app.post(
  '/api/logout',
  wrap((req, res) => {
    const token = parseCookies(req).sid;
    if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    clearSessionCookie(res);
    res.json({ ok: true });
  })
);

app.get('/api/me', auth, (req, res) => res.json({ user: req.user }));

app.post(
  '/api/me/password',
  auth,
  wrap((req, res) => {
    const actual = req.body.actual || '';
    const nueva = req.body.nueva || '';
    if (nueva.length < 6)
      return res.status(400).json({ error: 'La contraseña nueva debe tener al menos 6 caracteres' });
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!bcrypt.compareSync(actual, user.password_hash))
      return res.status(401).json({ error: 'La contraseña actual no coincide' });
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
      bcrypt.hashSync(nueva, 10),
      req.user.id
    );
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(
      req.user.id,
      parseCookies(req).sid
    );
    res.json({ ok: true });
  })
);

/* ------------------------------------------------------------------ users */

app.get(
  '/api/users',
  auth,
  wrap((req, res) => {
    res.json(
      db
        .prepare('SELECT id, username, nombre, activo, created_at FROM users ORDER BY nombre COLLATE NOCASE')
        .all()
    );
  })
);

app.post(
  '/api/users',
  auth,
  wrap((req, res) => {
    const username = clean(req.body.username || '');
    const nombre = clean(req.body.nombre || '');
    const password = req.body.password || '';
    if (!username || !nombre) return res.status(400).json({ error: 'Usuario y nombre son obligatorios' });
    if (password.length < 6)
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    const info = db
      .prepare('INSERT INTO users (username, nombre, password_hash) VALUES (?, ?, ?)')
      .run(username, nombre, bcrypt.hashSync(password, 10));
    res.status(201).json({ id: info.lastInsertRowid });
  })
);

app.put(
  '/api/users/:id',
  auth,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const username = clean(req.body.username || user.username);
    const nombre = clean(req.body.nombre || user.nombre);
    const activo = req.body.activo === undefined ? user.activo : req.body.activo ? 1 : 0;
    if (!activo && id === req.user.id)
      return res.status(400).json({ error: 'No podés desactivar tu propio usuario' });

    db.prepare('UPDATE users SET username = ?, nombre = ?, activo = ? WHERE id = ?').run(
      username,
      nombre,
      activo,
      id
    );
    if (req.body.password) {
      if (req.body.password.length < 6)
        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
        bcrypt.hashSync(req.body.password, 10),
        id
      );
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    }
    res.json({ ok: true });
  })
);

app.delete(
  '/api/users/:id',
  auth,
  wrap((req, res) => {
    const id = Number(req.params.id);
    if (id === req.user.id) return res.status(400).json({ error: 'No podés borrar tu propio usuario' });
    const n = db.prepare('SELECT COUNT(*) AS n FROM users WHERE activo = 1').get().n;
    if (n <= 1) return res.status(400).json({ error: 'Tiene que quedar al menos un usuario' });
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    res.json({ ok: true });
  })
);

/* ---------------------------------------------------------------- players */

app.get(
  '/api/players',
  auth,
  wrap((req, res) => {
    const q = clean(req.query.q || '');
    const incluirInactivos = req.query.todos === '1';
    let sql = 'SELECT * FROM players';
    const where = [];
    const params = [];
    if (!incluirInactivos) where.push('activo = 1');
    if (q) {
      where.push("(apellido LIKE ? OR nombre LIKE ? OR IFNULL(apodo,'') LIKE ? OR dni LIKE ?)");
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY apellido COLLATE NOCASE, nombre COLLATE NOCASE';
    res.json(db.prepare(sql).all(...params));
  })
);

app.post(
  '/api/players',
  auth,
  wrap((req, res) => {
    const dni = String(clean(req.body.dni || '')).replace(/\D/g, '');
    const nombre = clean(req.body.nombre || '');
    const apellido = clean(req.body.apellido || '');
    const apodo = clean(req.body.apodo || '') || null;
    if (!dni || !nombre || !apellido)
      return res.status(400).json({ error: 'DNI, nombre y apellido son obligatorios' });
    const info = db
      .prepare('INSERT INTO players (dni, nombre, apellido, apodo) VALUES (?, ?, ?, ?)')
      .run(dni, nombre, apellido, apodo);
    res.status(201).json({ id: info.lastInsertRowid });
  })
);

app.put(
  '/api/players/:id',
  auth,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const p = db.prepare('SELECT * FROM players WHERE id = ?').get(id);
    if (!p) return res.status(404).json({ error: 'Jugador no encontrado' });
    const dni = String(clean(req.body.dni ?? p.dni)).replace(/\D/g, '');
    const nombre = clean(req.body.nombre ?? p.nombre);
    const apellido = clean(req.body.apellido ?? p.apellido);
    const apodo = clean(req.body.apodo ?? p.apodo) || null;
    const activo = req.body.activo === undefined ? p.activo : req.body.activo ? 1 : 0;
    if (!dni || !nombre || !apellido)
      return res.status(400).json({ error: 'DNI, nombre y apellido son obligatorios' });
    db.prepare(
      'UPDATE players SET dni = ?, nombre = ?, apellido = ?, apodo = ?, activo = ? WHERE id = ?'
    ).run(dni, nombre, apellido, apodo, activo, id);
    res.json({ ok: true });
  })
);

app.delete(
  '/api/players/:id',
  auth,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const usado = db.prepare('SELECT COUNT(*) AS n FROM match_players WHERE player_id = ?').get(id).n;
    if (usado > 0) {
      db.prepare('UPDATE players SET activo = 0 WHERE id = ?').run(id);
      return res.json({ ok: true, desactivado: true });
    }
    db.prepare('DELETE FROM players WHERE id = ?').run(id);
    res.json({ ok: true });
  })
);

/* ---------------------------------------------------------------- matches */

function rosterDe(matchId) {
  return db
    .prepare(
      `SELECT mp.numero, p.id AS player_id, p.dni, p.nombre, p.apellido, p.apodo
         FROM match_players mp JOIN players p ON p.id = mp.player_id
        WHERE mp.match_id = ?
        ORDER BY mp.numero`
    )
    .all(matchId);
}

app.get(
  '/api/matches',
  auth,
  wrap((req, res) => {
    const rows = db
      .prepare(
        `SELECT m.*,
                (SELECT COUNT(*) FROM match_players mp WHERE mp.match_id = m.id) AS cargados,
                (SELECT IFNULL(SUM(e.puntos),0) FROM match_events e
                  WHERE e.match_id = m.id AND e.equipo = 'nosotros') AS puntos_nosotros,
                (SELECT IFNULL(SUM(e.puntos),0) FROM match_events e
                  WHERE e.match_id = m.id AND e.equipo = 'rival') AS puntos_rival
           FROM matches m
          ORDER BY m.fecha_hora DESC`
      )
      .all();
    res.json(rows);
  })
);

app.get(
  '/api/matches/:id',
  auth,
  wrap((req, res) => {
    const m = db.prepare('SELECT * FROM matches WHERE id = ?').get(Number(req.params.id));
    if (!m) return res.status(404).json({ error: 'Partido no encontrado' });
    res.json({ ...m, roster: rosterDe(m.id) });
  })
);

function validarPartido(body) {
  const equipo = clean(body.equipo || '');
  const rival = clean(body.rival || '');
  const lugar = clean(body.lugar || '') || null;
  const fecha_hora = clean(body.fecha_hora || '');
  const notas = clean(body.notas || '') || null;
  if (!['A', 'B'].includes(equipo)) return { error: 'Equipo debe ser A o B' };
  if (!rival) return { error: 'El rival es obligatorio' };
  if (!fecha_hora) return { error: 'La fecha y hora son obligatorias' };
  return { equipo, rival, lugar, fecha_hora, notas };
}

app.post(
  '/api/matches',
  auth,
  wrap((req, res) => {
    const v = validarPartido(req.body);
    if (v.error) return res.status(400).json({ error: v.error });
    const info = db
      .prepare('INSERT INTO matches (equipo, rival, lugar, fecha_hora, notas) VALUES (?, ?, ?, ?, ?)')
      .run(v.equipo, v.rival, v.lugar, v.fecha_hora, v.notas);
    res.status(201).json({ id: info.lastInsertRowid });
  })
);

app.put(
  '/api/matches/:id',
  auth,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const m = db.prepare('SELECT * FROM matches WHERE id = ?').get(id);
    if (!m) return res.status(404).json({ error: 'Partido no encontrado' });
    const v = validarPartido({ ...m, ...req.body });
    if (v.error) return res.status(400).json({ error: v.error });
    db.prepare(
      'UPDATE matches SET equipo = ?, rival = ?, lugar = ?, fecha_hora = ?, notas = ? WHERE id = ?'
    ).run(v.equipo, v.rival, v.lugar, v.fecha_hora, v.notas, id);
    res.json({ ok: true });
  })
);

app.delete(
  '/api/matches/:id',
  auth,
  wrap((req, res) => {
    db.prepare('DELETE FROM matches WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  })
);

/* ------------------------------------------------------------ asignación */

// Asignar un jugador a un número. Si el jugador ya estaba en otro número
// del mismo partido, se mueve (y si el destino estaba ocupado, se intercambian).
app.put(
  '/api/matches/:id/slots/:numero',
  auth,
  wrap((req, res) => {
    const matchId = Number(req.params.id);
    const numero = Number(req.params.numero);
    const playerId = Number(req.body.player_id);
    if (!(numero >= 1 && numero <= TOTAL_SLOTS))
      return res.status(400).json({ error: 'Número fuera de rango (1-25)' });
    const m = db.prepare('SELECT id FROM matches WHERE id = ?').get(matchId);
    if (!m) return res.status(404).json({ error: 'Partido no encontrado' });
    const p = db.prepare('SELECT id FROM players WHERE id = ?').get(playerId);
    if (!p) return res.status(404).json({ error: 'Jugador no encontrado' });

    const tx = db.transaction(() => {
      const actual = db
        .prepare('SELECT numero FROM match_players WHERE match_id = ? AND player_id = ?')
        .get(matchId, playerId);
      const ocupante = db
        .prepare('SELECT player_id FROM match_players WHERE match_id = ? AND numero = ?')
        .get(matchId, numero);

      db.prepare('DELETE FROM match_players WHERE match_id = ? AND numero = ?').run(matchId, numero);
      if (actual)
        db.prepare('DELETE FROM match_players WHERE match_id = ? AND player_id = ?').run(
          matchId,
          playerId
        );

      db.prepare(
        `INSERT INTO match_players (match_id, player_id, numero, updated_by)
         VALUES (?, ?, ?, ?)`
      ).run(matchId, playerId, numero, req.user.id);

      // intercambio: el que estaba en el destino pasa al número que dejó libre
      if (actual && ocupante && ocupante.player_id !== playerId) {
        db.prepare(
          `INSERT INTO match_players (match_id, player_id, numero, updated_by)
           VALUES (?, ?, ?, ?)`
        ).run(matchId, ocupante.player_id, actual.numero, req.user.id);
      }
    });
    tx();
    res.json({ roster: rosterDe(matchId) });
  })
);

app.delete(
  '/api/matches/:id/slots/:numero',
  auth,
  wrap((req, res) => {
    const matchId = Number(req.params.id);
    db.prepare('DELETE FROM match_players WHERE match_id = ? AND numero = ?').run(
      matchId,
      Number(req.params.numero)
    );
    res.json({ roster: rosterDe(matchId) });
  })
);

// Compactar: elimina huecos dentro de cada grupo (titulares / suplentes / adicionales)
app.post(
  '/api/matches/:id/compactar',
  auth,
  wrap((req, res) => {
    const matchId = Number(req.params.id);
    const roster = rosterDe(matchId);
    const grupos = [
      { desde: 1, hasta: 15 },
      { desde: 16, hasta: 23 },
      { desde: 24, hasta: 25 },
    ];
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM match_players WHERE match_id = ?').run(matchId);
      const ins = db.prepare(
        'INSERT INTO match_players (match_id, player_id, numero, updated_by) VALUES (?, ?, ?, ?)'
      );
      for (const g of grupos) {
        const enGrupo = roster.filter((r) => r.numero >= g.desde && r.numero <= g.hasta);
        enGrupo.forEach((r, i) => ins.run(matchId, r.player_id, g.desde + i, req.user.id));
      }
    });
    tx();
    res.json({ roster: rosterDe(matchId) });
  })
);

// Copiar el plantel de otro partido (solo llena los números vacíos)
app.post(
  '/api/matches/:id/copiar/:origenId',
  auth,
  wrap((req, res) => {
    const destino = Number(req.params.id);
    const origen = Number(req.params.origenId);
    const rosterOrigen = rosterDe(origen);
    const ocupados = new Set(rosterDe(destino).map((r) => r.numero));
    const yaEstan = new Set(rosterDe(destino).map((r) => r.player_id));
    const ins = db.prepare(
      'INSERT INTO match_players (match_id, player_id, numero, updated_by) VALUES (?, ?, ?, ?)'
    );
    const tx = db.transaction(() => {
      for (const r of rosterOrigen) {
        if (ocupados.has(r.numero) || yaEstan.has(r.player_id)) continue;
        const activo = db.prepare('SELECT activo FROM players WHERE id = ?').get(r.player_id);
        if (!activo || !activo.activo) continue;
        ins.run(destino, r.player_id, r.numero, req.user.id);
      }
    });
    tx();
    res.json({ roster: rosterDe(destino) });
  })
);

/* ------------------------------------------------- seguimiento en vivo */

const PUNTOS = { try: 5, conversion: 2, penal: 3, drop: 3, try_penal: 7, amarilla: 0, roja: 0 };
const NOMBRE_TIPO = {
  try: 'Try', conversion: 'Conversión', penal: 'Penal', drop: 'Drop',
  try_penal: 'Try penal', amarilla: 'Amarilla', roja: 'Roja',
};
const DUR_AMARILLA = 600; // 10 minutos de juego

// Segundos jugados del período en curso
function segundosPeriodo(m) {
  const extra = m.reloj_corriendo && m.reloj_desde
    ? Math.floor((Date.now() - m.reloj_desde) / 1000)
    : 0;
  return m.reloj_base_seg + extra;
}

// Segundos jugados desde el arranque del partido (para las tarjetas)
function absoluto(m, periodo, seg) {
  return periodo >= 2 ? m.primer_tiempo_seg + seg : seg;
}

function eventosDe(matchId) {
  return db
    .prepare(
      `SELECT e.*, p.nombre, p.apellido, p.apodo
         FROM match_events e LEFT JOIN players p ON p.id = e.player_id
        WHERE e.match_id = ?
        ORDER BY e.t_abs, e.id`
    )
    .all(matchId);
}

function vivoDe(matchId) {
  const m = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
  if (!m) return null;
  const eventos = eventosDe(matchId);
  const seg = segundosPeriodo(m);
  const ahoraAbs = absoluto(m, m.periodo || 1, seg);

  const marcador = { nosotros: 0, rival: 0 };
  for (const e of eventos) marcador[e.equipo === 'rival' ? 'rival' : 'nosotros'] += e.puntos;

  const tarjetas = eventos
    .filter((e) => e.tipo === 'amarilla' || e.tipo === 'roja')
    .map((e) => ({
      id: e.id,
      tipo: e.tipo,
      equipo: e.equipo,
      player_id: e.player_id,
      nombre: e.nombre,
      apellido: e.apellido,
      minuto: Math.floor(e.t_abs / 60) + 1,
      restante: e.tipo === 'roja' ? null : Math.max(0, DUR_AMARILLA - (ahoraAbs - e.t_abs)),
    }));

  return {
    partido: {
      id: m.id, equipo: m.equipo, rival: m.rival, lugar: m.lugar,
      fecha_hora: m.fecha_hora, notas: m.notas, estado: m.estado,
      periodo: m.periodo, reloj_corriendo: m.reloj_corriendo,
      reloj_base_seg: m.reloj_base_seg, reloj_desde: m.reloj_desde,
      primer_tiempo_seg: m.primer_tiempo_seg,
    },
    club: CLUB,
    ahora: Date.now(),
    marcador,
    eventos,
    tarjetas,
  };
}

app.get(
  '/api/matches/:id/vivo',
  auth,
  wrap((req, res) => {
    const v = vivoDe(Number(req.params.id));
    if (!v) return res.status(404).json({ error: 'Partido no encontrado' });
    res.json(v);
  })
);

// Manejo del reloj y del estado del partido
app.post(
  '/api/matches/:id/reloj',
  auth,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const m = db.prepare('SELECT * FROM matches WHERE id = ?').get(id);
    if (!m) return res.status(404).json({ error: 'Partido no encontrado' });
    const accion = clean(req.body.accion || '');

    const set = (campos) => {
      const claves = Object.keys(campos);
      db.prepare(`UPDATE matches SET ${claves.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
        .run(...claves.map((k) => campos[k]), id);
    };

    if (accion === 'iniciar') {
      if (m.estado === 'finalizado') return res.status(400).json({ error: 'El partido ya terminó' });
      if (m.reloj_corriendo) return res.json(vivoDe(id));
      set({
        estado: 'en_curso',
        periodo: m.periodo === 0 ? 1 : m.periodo,
        reloj_corriendo: 1,
        reloj_desde: Date.now(),
      });
    } else if (accion === 'pausar') {
      if (!m.reloj_corriendo) return res.json(vivoDe(id));
      set({ reloj_corriendo: 0, reloj_base_seg: segundosPeriodo(m), reloj_desde: null });
    } else if (accion === 'fin_periodo') {
      const seg = segundosPeriodo(m);
      if (m.periodo <= 1) {
        set({
          periodo: 2, primer_tiempo_seg: seg,
          reloj_corriendo: 0, reloj_base_seg: 0, reloj_desde: null,
          estado: 'en_curso',
        });
      } else {
        set({ periodo: 3, reloj_corriendo: 0, reloj_base_seg: seg, reloj_desde: null, estado: 'finalizado' });
      }
    } else if (accion === 'finalizar') {
      set({
        estado: 'finalizado', periodo: 3,
        reloj_corriendo: 0, reloj_base_seg: segundosPeriodo(m), reloj_desde: null,
      });
    } else if (accion === 'reabrir') {
      set({ estado: 'en_curso', periodo: m.periodo === 3 ? 2 : m.periodo || 1, reloj_corriendo: 0 });
    } else if (accion === 'ajustar') {
      const seg = Math.max(0, Math.min(7200, Number(req.body.segundos) || 0));
      set({ reloj_base_seg: seg, reloj_desde: m.reloj_corriendo ? Date.now() : null });
    } else if (accion === 'reiniciar') {
      set({
        estado: 'programado', periodo: 0, reloj_corriendo: 0,
        reloj_base_seg: 0, reloj_desde: null, primer_tiempo_seg: 0,
      });
    } else {
      return res.status(400).json({ error: 'Acción desconocida' });
    }
    res.json(vivoDe(id));
  })
);

app.post(
  '/api/matches/:id/eventos',
  auth,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const m = db.prepare('SELECT * FROM matches WHERE id = ?').get(id);
    if (!m) return res.status(404).json({ error: 'Partido no encontrado' });

    const tipo = clean(req.body.tipo || '');
    if (!(tipo in PUNTOS)) return res.status(400).json({ error: 'Tipo de evento inválido' });
    const equipo = req.body.equipo === 'rival' ? 'rival' : 'nosotros';
    let playerId = req.body.player_id ? Number(req.body.player_id) : null;
    if (equipo === 'rival') playerId = null; // del rival no guardamos jugadores
    if (playerId && !db.prepare('SELECT id FROM players WHERE id = ?').get(playerId))
      return res.status(404).json({ error: 'Jugador no encontrado' });
    if (m.periodo === 0)
      return res.status(400).json({ error: 'Arrancá el reloj antes de cargar el partido' });

    const periodo = Math.min(m.periodo, 2);
    // El minuto se puede corregir a mano si se cargó tarde
    const seg = req.body.segundos == null
      ? segundosPeriodo(m)
      : Math.max(0, Math.min(7200, Number(req.body.segundos)));

    db.prepare(
      `INSERT INTO match_events (match_id, tipo, equipo, player_id, puntos, periodo, segundos, t_abs, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, tipo, equipo, playerId, PUNTOS[tipo], periodo, seg, absoluto(m, periodo, seg), req.user.id);

    res.status(201).json(vivoDe(id));
  })
);

app.delete(
  '/api/matches/:id/eventos/:eid',
  auth,
  wrap((req, res) => {
    const id = Number(req.params.id);
    db.prepare('DELETE FROM match_events WHERE id = ? AND match_id = ?').run(Number(req.params.eid), id);
    res.json(vivoDe(id));
  })
);

/* ----------------------------------------------------------- exportación */

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function fechaLegible(iso) {
  // iso: "YYYY-MM-DDTHH:MM" (hora local del club, sin zona)
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(iso || '');
  if (!m) return iso || '';
  const [, y, mo, d, h, mi] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d));
  return `${DIAS[dt.getDay()]} ${d}/${mo}/${y} ${h}:${mi} hs`;
}

function textoExport(matchId) {
  const m = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
  if (!m) return null;
  const roster = rosterDe(matchId);
  const lineas = [];
  if (CLUB) lineas.push(CLUB.toUpperCase());
  lineas.push(`*Equipo ${m.equipo} vs ${m.rival}*`);
  lineas.push(fechaLegible(m.fecha_hora));
  if (m.lugar) lineas.push(m.lugar);
  lineas.push('');

  const bloques = [
    { titulo: 'TITULARES', desde: 1, hasta: 15 },
    { titulo: 'SUPLENTES', desde: 16, hasta: 23 },
    { titulo: 'ADICIONALES', desde: 24, hasta: 25 },
  ];
  for (const b of bloques) {
    const enBloque = roster.filter((r) => r.numero >= b.desde && r.numero <= b.hasta);
    if (!enBloque.length) continue;
    lineas.push(`*${b.titulo}*`);
    for (const r of enBloque) {
      lineas.push(`${r.numero}. ${r.nombre} ${r.apellido} - ${r.dni}`);
    }
    lineas.push('');
  }
  lineas.push(`Total: ${roster.length} jugadores`);
  if (m.notas) lineas.push('', m.notas);
  return lineas.join('\n').trim();
}

function textoResumen(matchId) {
  const m = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
  if (!m) return null;
  const eventos = eventosDe(matchId);
  let nos = 0, riv = 0;
  for (const e of eventos) {
    if (e.equipo === 'rival') riv += e.puntos; else nos += e.puntos;
  }

  const min = (e) => `${Math.floor(e.t_abs / 60) + 1}'`;
  const jugador = (e) => (e.apellido ? ` · ${e.nombre} ${e.apellido}` : '');
  const lineas = [];

  lineas.push(`*${CLUB} ${nos} - ${riv} ${m.rival}*`);
  lineas.push(`Equipo ${m.equipo} · ${fechaLegible(m.fecha_hora)}`);
  if (m.lugar) lineas.push(m.lugar);
  lineas.push(m.estado === 'finalizado' ? 'Final' : m.estado === 'en_curso' ? 'En juego' : 'Sin comenzar');
  lineas.push('');

  const puntos = eventos.filter((e) => e.puntos > 0);
  const nuestros = puntos.filter((e) => e.equipo !== 'rival');
  const delRival = puntos.filter((e) => e.equipo === 'rival');

  if (nuestros.length) {
    lineas.push(`*PUNTOS ${CLUB.toUpperCase()}*`);
    for (const e of nuestros) lineas.push(`${min(e)} ${NOMBRE_TIPO[e.tipo]}${jugador(e)}`);
    lineas.push('');
  }
  if (delRival.length) {
    lineas.push(`*PUNTOS ${m.rival.toUpperCase()}*`);
    for (const e of delRival) lineas.push(`${min(e)} ${NOMBRE_TIPO[e.tipo]}`);
    lineas.push('');
  }

  const tarjetas = eventos.filter((e) => e.tipo === 'amarilla' || e.tipo === 'roja');
  if (tarjetas.length) {
    lineas.push('*TARJETAS*');
    for (const e of tarjetas) {
      const quien = e.equipo === 'rival' ? m.rival : (e.apellido ? `${e.nombre} ${e.apellido}` : CLUB);
      lineas.push(`${min(e)} ${e.tipo === 'roja' ? '🟥' : '🟨'} ${quien}`);
    }
    lineas.push('');
  }

  if (!puntos.length && !tarjetas.length) lineas.push('Sin acciones cargadas.');
  return lineas.join('\n').trim();
}

app.get(
  '/api/matches/:id/export',
  auth,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const plantel = textoExport(id);
    if (plantel === null) return res.status(404).json({ error: 'Partido no encontrado' });
    res.json({ texto: plantel, plantel, resumen: textoResumen(id) });
  })
);

/* -------------------------------------------------------------- estáticos */

app.use(
  express.static(path.join(__dirname, '..', 'public'), {
    maxAge: '1h',
    setHeaders(res, filePath) {
      if (filePath.endsWith('index.html') || filePath.endsWith('sw.js')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  })
);

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'No encontrado' });
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`[rugby-equipos] escuchando en http://${HOST}:${PORT}`);
});
