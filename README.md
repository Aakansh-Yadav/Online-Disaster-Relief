# Online Disaster Relief

Online Disaster Relief helps people post **needs** (“Need insulin”) and **offers** (“Space for 3”) during emergencies, then match by category. Posts go through the Express API. The board and chat update over WebSockets, and the board also refreshes every 4 seconds as a fallback.

Requires **Node.js 22.5+** (the API uses the built-in `node:sqlite` module).

## Architecture

```
Post / Accept / Chat
    → Express API + SQLite
    → Live board and chat (Socket.io)
    → Board also polls every 4s
```

## How to run

### Dev (web + API)

```bash
npm install
npm run dev
```

- API: `http://localhost:3001` (or `PORT` if you set that env var)
- App: `http://localhost:5173` (proxies `/api` and `/socket.io`)

The web app is pinned to port **5173** (`strictPort: true`). If **5173** or **3001** is already in use, stop the other `npm run dev` first.

Or separately: `npm run dev:server` and `npm run dev:client`.

Optional: set `VITE_SOCKET_URL` if the Socket.io client should connect somewhere other than the current page origin (dev already uses the Vite proxy).

### Phone browser on the same Wi‑Fi

1. Keep `npm run dev` running.
2. Connect the phone to the same Wi‑Fi as this computer.
3. On the phone, open the **Network** URL Vite prints (for example `http://192.168.x.x:5173`).

`localhost` on the phone is the phone, not this PC. If the page does not load, allow Node.js through Windows Firewall for private networks.

### Phone browser on another network

```bash
npm run share
```

Keep `npm run dev` running in another terminal, then open the `https://…trycloudflare.com` URL that command prints.

### Capacitor Android

`npm run cap:sync` builds `dist` and copies it into the Android project. The APK loads those **static** files (`webDir: dist`, `base: './'`). In the packaged app, `/api` and `/socket.io` go to the WebView origin (`https://localhost`), **not** to your PC.

That means:

- Use the phone **browser** with the Network or `npm run share` URL to talk to this computer’s API.
- To point the **native app** at a live server, set `server.url` in `capacitor.config.ts` to that URL (and `cleartext: true` if it is `http://`), then sync again. You can also set `VITE_SOCKET_URL` to that same origin before `npm run cap:sync`.

1. USB-debug a physical Android phone (or use an emulator). Enable Location if you want to pin a post with GPS.
2. Build and open Android Studio:

```bash
npm run cap:sync
npx cap open android
# or: npm run cap:android
# or: npm run cap:run:android
```

Package id: `com.onlinedisasterrelief.app`.

## Core features

- Post need/offer, board filters (kind, category, open needs), suggested matches by category
- Accept / confirmation flow, then chat between requester and helper
- Helper can cancel an accept (reopens the need). Anyone on the board can mark a post fulfilled
- Live board and chat updates over WebSockets, plus a 4-second board refresh
- Connection indicator on the board: Live / Connecting… / Disconnected
- Optional GPS pin when **posting** (browser geolocation; last pin is reused if a live fix fails)
- Typed **area** is always required. The server geocodes that area when creating a post if no GPS pin is sent, and again when accepting (helper types their area; no GPS on accept)

The UI does not delete posts or set status to `cancelled`. Those exist on the API only. Cancel accept sets status back to `open`.

## API (quick reference)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/posts` | List posts. Query: `kind`, `category`, `status` (`active` default = open + accepted; or `open` / `accepted` / `fulfilled` / `cancelled` / `all`), `includeMatches=1` for suggested pairs |
| `GET` | `/api/posts/:id` | Get one post |
| `POST` | `/api/posts` | Create need/offer. Optional `lat`/`lng`; otherwise the server may geocode `area` |
| `PATCH` | `/api/posts/:id` | Set `status` (`open`, `accepted`, `fulfilled`, or `cancelled`). Accepting also requires `acceptedBy`: `{ id, name, area? }` |
| `DELETE` | `/api/posts/:id` | Delete post and its messages (API only; no delete button in the UI) |
| `GET` | `/api/posts/:id/messages` | List chat messages (`deviceId` query required; optional `claimOwner=1`) |
| `POST` | `/api/posts/:id/messages` | Send a chat message (`deviceId` in the body required; optional `claimOwner`) |

Chat is only for the requester and the helper after a need is accepted (or fulfilled). `claimOwner` lets a requester without a stored `createdById` claim the thread.

SQLite file: `server/data/online-disaster-relief.db`. If that file is missing and a legacy `server/data/beacon.db` exists, the API uses the legacy file instead. The `data` folder is created on first run and is gitignored.
