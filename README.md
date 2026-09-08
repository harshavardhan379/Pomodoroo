# Focusblocks

A simple Pomodoro web app. Three timer modes, a circular countdown, and a session log
where every finished Pomodoro is tagged with a **task** and a **block** (a free-text
category). A report page shows sessions per day and a table you can sort by block.

The frontend works entirely offline in the browser. Point it at the bundled Node backend
and your session log **syncs across devices**.

## Quick start

```bash
npm install
npm start
```

Open http://localhost:3000. The console prints a **sync key** on first run — open the
**Sync** pill in the top bar and paste it in to enable syncing. (Without a key, everything
still works and is stored in `localStorage`.)

For local timer testing, add `?fast` to the URL to run each minute as one second.

## How it works

- **Frontend** (`public/`) — plain HTML/CSS/JS, no build step. `localStorage` is the
  offline-first working copy; the timer itself is saved continuously and resumes after a
  reload or the machine sleeping.
- **Backend** (`server/`) — Express + SQLite (`better-sqlite3`). Serves the frontend and a
  small API. Single dataset, protected by one sync key.
- **Sync** — the client sends its whole session log to `PUT /api/sessions` and gets the
  merged set back. Merges are last-writer-wins per record, decided by `updatedAt`, so two
  devices editing different sessions both keep their changes. A finished Pomodoro is
  written to the log *before* the tag dialog, so it survives a tab close either way.

### API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | liveness, no auth |
| `GET` | `/api/auth` | validate a sync key |
| `GET` | `/api/sessions` | full session log |
| `PUT` | `/api/sessions` | push local changes, receive the merged log |
| `POST` | `/api/sessions` | upsert a single session |

All except `/api/health` require `Authorization: Bearer <SYNC_KEY>`.

## Configuration

| Env var | Default | Notes |
| --- | --- | --- |
| `PORT` | `3000` | |
| `DATA_DIR` | `./data` | where `focusblocks.db` and the generated key live |
| `SYNC_KEY` | *(generated)* | set this on a deployed instance |
| `ALLOW_ORIGIN` | *(off)* | set to your frontend origin only if it's hosted separately |

## Deploy

Any host that runs a container with a persistent volume works. The repo includes a
`Dockerfile` and a `fly.toml`:

```bash
fly launch --no-deploy
fly volumes create focusblocks_data --size 1
fly secrets set SYNC_KEY=$(openssl rand -base64 24)
fly deploy
```

On Railway / Render, deploy from the Dockerfile, attach a volume mounted at `/data`, and
set `SYNC_KEY`. The frontend is served from the same origin, so there's nothing else to
host.

## Project layout

```
public/            frontend (index.html, styles.css, app.js)
server/            index.js (Express) + db.js (SQLite)
design/            the design canvas this was built from
Dockerfile         one container: API + static + SQLite
fly.toml           example deploy config
```

## License

MIT — see [LICENSE](LICENSE).
