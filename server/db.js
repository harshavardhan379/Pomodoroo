import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'focusblocks.db'));
db.pragma('journal_mode = WAL');

const firstAccessKey = (process.env.ACCESS_KEYS || process.env.ACCESS_KEY || '')
  .split(/[\n,]/).map((key) => key.trim()).find(Boolean) || 'legacy';
const defaultOwnerId = crypto.createHash('sha256').update(firstAccessKey).digest('hex').slice(0, 24);

const hasOwnerColumn = db.prepare("SELECT 1 FROM pragma_table_info('sessions') WHERE name = 'owner_id'").get();
if (hasOwnerColumn === undefined && db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sessions'").get()) {
  db.exec(`
    ALTER TABLE sessions RENAME TO sessions_legacy;
    CREATE TABLE sessions (
      owner_id TEXT NOT NULL,
      id TEXT NOT NULL,
      date TEXT NOT NULL,
      ts INTEGER NOT NULL,
      task TEXT NOT NULL DEFAULT '',
      block TEXT NOT NULL DEFAULT 'Unassigned',
      minutes INTEGER NOT NULL DEFAULT 25,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (owner_id, id)
    );
    INSERT INTO sessions (owner_id, id, date, ts, task, block, minutes, updated_at)
      SELECT '${defaultOwnerId}', id, date, ts, task, block, minutes, updated_at FROM sessions_legacy;
    DROP TABLE sessions_legacy;
  `);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    owner_id TEXT NOT NULL,
    id TEXT NOT NULL,
    date TEXT NOT NULL,
    ts INTEGER NOT NULL,
    task TEXT NOT NULL DEFAULT '',
    block TEXT NOT NULL DEFAULT 'Unassigned',
    minutes INTEGER NOT NULL DEFAULT 25,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (owner_id, id)
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_ts ON sessions(ts);
`);

const all = db.prepare('SELECT id, date, ts, task, block, minutes, updated_at AS updatedAt FROM sessions WHERE owner_id = ? ORDER BY ts');
const upsert = db.prepare(`
  INSERT INTO sessions (owner_id, id, date, ts, task, block, minutes, updated_at)
  VALUES (@ownerId, @id, @date, @ts, @task, @block, @minutes, @updatedAt)
  ON CONFLICT(owner_id, id) DO UPDATE SET
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

export const listSessions = (ownerId) => all.all(ownerId).map(clean);

export const upsertMany = db.transaction((ownerId, records) => {
  records.forEach((record) => {
    const session = clean(record);
    if (session.id && Number.isFinite(session.ts)) upsert.run({ ...session, ownerId });
  });
  return records;
});

export default db;
