# prop2ical

Chrome extension + ElysiaJS server that scrapes the ProPortal timetable at
`/ProPortal/pages/ilp/prosolution/26_1/pstimetable.aspx` and converts it to iCal.

## Structure

```
server/    – ElysiaJS (Bun) – POST /api/timetable → GET /api/ical/:id
extension/ – Chrome MV3 extension – content script auto-scrapes the table
```

## Server (auth + file persistence, like elt2ical)

```bash
cd server
bun install
# like elt2ical/.example.env - secret guards the URL and POST
cat .env.example  # RANDOM_IDENTIFER=...
# RANDOM_IDENTIFER, RANDOM_IDENTIFIER, AUTH_TOKEN, SECRET are aliases
RANDOM_IDENTIFER=your-secret-uuid bun run dev  # http://localhost:3000
# env: PORT=3000 TIMEZONE=Europe/London DATA_FILE=./data/timetable.json
```

Auth mirrors `elt2ical/server.ts:13` (`RANDOM_IDENTIFER`): the same secret is required as `Authorization: Bearer <secret>` (or `X-Auth-Token`) on `POST` and as the path param on `GET /api/ical/:id` (else 404). Persisted to `DATA_FILE` (default `./data/timetable.json`) and restored on restart - `GET` works after server reboot without re-scraping.

Endpoints:
- `POST /api/timetable` – **auth required**, body `{ dates?, events: {title,date,start,end,staff?,room?}[] }` → `{ id (=secret), icalUrl, webcalUrl }` + writes `data/timetable.json`
- `POST /api/convert` – **auth required**, same payload → `text/calendar` directly
- `GET /api/ical/:id` / `GET /ical/:id.ics` – `id` must equal `RANDOM_IDENTIFER` (elt2ical-style); returns `.ics`

## Extension (TypeScript + esbuild)

Source lives in `extension/src/*.ts`, static assets in `extension/public/`, built to `extension/dist/` (load this in Chrome).

```bash
cd extension
bun install          # once
bun run build        # one-off build → dist/
bun run dev          # watch src/ + public/ → rebuild on change (esbuild)
# or: bun run watch
bun run typecheck    # tsc --noEmit
```

1. `bun run build` (or `dev` for watch), then `chrome://extensions` → Developer mode → Load unpacked → select `extension/dist`
2. Set **server URL** and **auth token** (must match server's `RANDOM_IDENTIFER`) in popup/options → Save
3. Open `https://…/ProPortal/pages/ilp/prosolution/26_1/pstimetable.aspx` – it auto-scrapes and shows a banner with the iCal link (`/api/ical/<secret>`). Or click **Scrape & send now** in the popup.