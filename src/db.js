'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'rugby.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nombre        TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  activo        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS players (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  dni        TEXT NOT NULL UNIQUE,
  nombre     TEXT NOT NULL,
  apellido   TEXT NOT NULL,
  apodo      TEXT,
  activo     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS matches (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  equipo     TEXT NOT NULL CHECK (equipo IN ('A','B')),
  rival      TEXT NOT NULL,
  lugar      TEXT,
  fecha_hora TEXT NOT NULL,
  notas      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS match_players (
  match_id   INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id  INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  numero     INTEGER NOT NULL CHECK (numero BETWEEN 1 AND 25),
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (match_id, numero),
  UNIQUE (match_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_players_apellido ON players(apellido);
CREATE INDEX IF NOT EXISTS idx_matches_fecha ON matches(fecha_hora);
`);

/* ---------------------------------------------------------- migraciones */
// Agregan columnas nuevas sin tocar los datos existentes.

function columnas(tabla) {
  return db.prepare(`PRAGMA table_info(${tabla})`).all().map((c) => c.name);
}
function agregarColumna(tabla, nombre, ddl) {
  if (!columnas(tabla).includes(nombre)) {
    db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${nombre} ${ddl}`);
    console.log(`[db] migración: ${tabla}.${nombre}`);
  }
}

// Seguimiento en vivo del partido
agregarColumna('matches', 'estado', "TEXT NOT NULL DEFAULT 'programado'"); // programado | en_curso | finalizado
agregarColumna('matches', 'periodo', 'INTEGER NOT NULL DEFAULT 0');        // 0 sin empezar, 1, 2, 3 terminado
agregarColumna('matches', 'reloj_corriendo', 'INTEGER NOT NULL DEFAULT 0');
agregarColumna('matches', 'reloj_base_seg', 'INTEGER NOT NULL DEFAULT 0'); // segundos acumulados del período
agregarColumna('matches', 'reloj_desde', 'INTEGER');                       // epoch ms desde que corre (o NULL)
agregarColumna('matches', 'primer_tiempo_seg', 'INTEGER NOT NULL DEFAULT 0');

db.exec(`
CREATE TABLE IF NOT EXISTS match_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id   INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  tipo       TEXT NOT NULL,      -- try | conversion | penal | drop | try_penal | amarilla | roja
  equipo     TEXT NOT NULL,      -- nosotros | rival
  player_id  INTEGER REFERENCES players(id) ON DELETE SET NULL,
  puntos     INTEGER NOT NULL DEFAULT 0,
  periodo    INTEGER NOT NULL,
  segundos   INTEGER NOT NULL,   -- segundos jugados dentro del período
  t_abs      INTEGER NOT NULL,   -- segundos jugados desde el inicio del partido
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_match ON match_events(match_id, t_abs);
`);

// Penales cometidos: el subtipo (offside, no rolar, etc.)
agregarColumna('match_events', 'detalle', 'TEXT');

// Usuario inicial
const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
if (count === 0) {
  const username = process.env.ADMIN_USER || 'admin';
  const password = process.env.ADMIN_PASS || 'rugby1234';
  db.prepare(
    'INSERT INTO users (username, nombre, password_hash) VALUES (?, ?, ?)'
  ).run(username, 'Administrador', bcrypt.hashSync(password, 10));
  console.log(`[db] usuario inicial creado: ${username} / ${password}`);
}

// Limpieza de sesiones vencidas al arrancar
db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();

module.exports = db;
