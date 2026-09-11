import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'focusblocks.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    ts INTEGER NOT NULL,
    task TEXT NOT NULL DEFAULT '',
    block TEXT NOT NULL DEFAULT 'Unassigned',
    minutes INTEGER NOT NULL DEFAULT 25,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_ts ON sessions(ts);
`);

const all = db.prepare('SELECT id, date, ts, task, block, minutes, updated_at AS updatedAt FROM sessions ORDER BY ts');
const get = db.prepare('SELECT id, date, ts, task, block, minutes, updated_at AS updatedAt FROM sessions WHERE id = ?');
const upsert = db.prepare(`
  INSERT INTO sessions (id, date, ts, task, block, minutes, updated_at)
  VALUES (@id, @date, @ts, @task, @block, @minutes, @updatedAt)
  ON CONFLICT(id) DO UPDATE SET
    date = excluded.date, ts = excluded.ts, task = excluded.task,
    block = excluded.block, minutes = excluded.minutes, updated_at = excluded.updated_at
  WHERE excluded.updated_at >= sessions.updated_at
`);

function clean(record) {
  return {
    id: String(record.id),
    date: String(record.date),
    ts: Number(record.ts),
    task: String(record.task || ''),
    block: String(record.block || 'Unassigned'),
    minutes: Number(record.minutes) || 25,
    updatedAt: Number(record.updatedAt) || Number(record.ts),
  };
}

export const listSessions = () => all.all().map(clean);

export const upsertMany = db.transaction((records) => {
  records.forEach((record) => {
    const session = clean(record);
    if (session.id && Number.isFinite(session.ts)) upsert.run(session);
  });
  return records;
});

export const getSession = (id) => get.get(id);

export default db;
