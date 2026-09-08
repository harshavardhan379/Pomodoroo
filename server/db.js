import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'focusblocks.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    date       TEXT    NOT NULL,
    ts         INTEGER NOT NULL,
    task       TEXT    NOT NULL DEFAULT '',
    block      TEXT    NOT NULL DEFAULT 'Unassigned',
    minutes    INTEGER NOT NULL DEFAULT 25,
    updated_at INTEGER NOT NULL,
    deleted    INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_ts ON sessions(ts);
`);

const stmts = {
  all: db.prepare('SELECT id, date, ts, task, block, minutes, updated_at AS updatedAt, deleted FROM sessions'),
  get: db.prepare('SELECT id, date, ts, task, block, minutes, updated_at AS updatedAt, deleted FROM sessions WHERE id = ?'),
  upsert: db.prepare(`
    INSERT INTO sessions (id, date, ts, task, block, minutes, updated_at, deleted)
    VALUES (@id, @date, @ts, @task, @block, @minutes, @updatedAt, @deleted)
    ON CONFLICT(id) DO UPDATE SET
      date = excluded.date, ts = excluded.ts, task = excluded.task,
      block = excluded.block, minutes = excluded.minutes,
      updated_at = excluded.updated_at, deleted = excluded.deleted
    WHERE excluded.updated_at >= sessions.updated_at
  `),
};

const clean = (row) => ({
  id: String(row.id),
  date: String(row.date),
  ts: Number(row.ts),
  task: String(row.task ?? ''),
  block: String(row.block || 'Unassigned'),
  minutes: Number(row.minutes) || 25,
  updatedAt: Number(row.updatedAt) || Date.now(),
  deleted: row.deleted ? 1 : 0,
});

export const listSessions = ({ includeDeleted = false } = {}) =>
  stmts.all.all().map(clean).filter((r) => includeDeleted || !r.deleted);

export const upsertSession = (rec) => {
  const row = clean({ ...rec, updatedAt: rec.updatedAt || Date.now() });
  stmts.upsert.run(row);
  return clean(stmts.get.get(row.id));
};

export const upsertMany = db.transaction((recs) => recs.map(upsertSession));

export default db;
