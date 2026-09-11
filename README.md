# Focusblocks

A single-user Pomodoro timer with a shared SQLite session history. It includes three timer modes, a circular countdown, local session history, and a seven-day report.

## Use it

For local use, install Node.js 20+ and run:

```bash
npm install
npm start
```

Open http://localhost:3000. For cross-device use on Netlify, deploy the repository and enable Netlify Blobs; the site will use the serverless session API automatically.

Set the same private `ACCESS_KEY` environment variable in your local server or Netlify site settings. The app asks for this key when you log in and sends it only to your own backend. For Netlify, use Site configuration -> Environment variables. For Fly.io, run `fly secrets set ACCESS_KEY="your-private-key"`.

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
