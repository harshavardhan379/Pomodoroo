# Focusblocks

A private key-scoped Pomodoro timer with shared session history. It includes three timer modes, a circular countdown, local session history, and a seven-day report.

## Use it

For local use, install Node.js 20+ and run:

```bash
npm install
npm start
```

Open http://localhost:3000. For cross-device use on Netlify, deploy the repository and enable Netlify Blobs; the site will use the serverless session API automatically.

Set `ACCESS_KEYS` in your local server or Netlify site settings. Put one private key per line or separate keys with commas. For example, five users can use five different keys:

```text
ACCESS_KEYS=first-private-key,second-private-key,third-private-key,fourth-private-key,fifth-private-key
```

Each key gets a separate session history. The app asks for the key when a user logs in and sends it only to your backend. `ACCESS_KEY` is still accepted for a single-key setup. For Netlify, use Site configuration -> Environment variables. For Fly.io, run `fly secrets set ACCESS_KEYS="key-one,key-two,key-three,key-four,key-five"`.

For local timer testing, add `?fast` to the URL to run each minute as one second.

The backend stores sessions in Netlify Blobs when deployed there, or SQLite when run with Express locally. The browser also keeps a local cache for offline use and automatically merges changes by session ID and `updatedAt`. Export and Import remain available as manual backups.

## Project layout

```
public/            static app (index.html, styles.css, app.js)
server/            Express API and SQLite storage
design/            design canvas files
Dockerfile         container deployment configuration
fly.toml           Fly.io deployment configuration
netlify.toml       Netlify Functions and redirect configuration
```

## License

MIT - see [LICENSE](LICENSE).
