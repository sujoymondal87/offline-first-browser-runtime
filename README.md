# offline-first-browser-runtime

> A browser runtime that installs content packs offline — audio, images, and video served from IndexedDB after a single online visit. Sessions sync to the backend when connectivity returns.

**Live Demo:** [coming soon]
**Backend API:** [coming soon]
**Case Study:** [coming soon]

## What it demonstrates

- Service Worker caching the app shell (network-first with cache fallback)
- IndexedDB as a chunked blob store for audio, images, and video
- Install pipeline with progress bar and automatic retry on failure
- Offline playback of audio and media after browser refresh
- Session event queue in IDB, flushed to Supabase on reconnect
- iOS audio unlock pattern (first-tap unlock)
- Parent → next block navigation (linear, extensible to branching)

## Architecture

```
Browser (online)                    Backend (Render)
─────────────────                   ───────────────
Fetch pack manifest    →  GET /api/packs/:id
Download assets        →  Static files (Netlify /public)
Chunk + store in IDB
Build blob URLs

Browser (offline)
─────────────────
SW serves app shell (Cache API)
IDB serves blobs → createObjectURL()
Session events queue in IDB

Browser (back online)
─────────────────────
Flush session queue    →  POST /api/sessions/sync  →  Supabase
Fetch recent sessions  ←  GET /api/sessions/recent ←  Supabase
```

## Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite + Tailwind CSS |
| Offline shell | Service Worker (Cache API) |
| Offline storage | IndexedDB (chunked blobs) |
| Backend | Node.js + Express + TypeScript |
| Database | Supabase PostgreSQL |
| Deploy (frontend) | Netlify |
| Deploy (backend) | Render |

## Quick start

```bash
# Backend
cd backend
cp .env.example .env  # fill in Supabase credentials
npm install
npm run dev

# Frontend
cd frontend
cp .env.example .env  # set VITE_API_URL=http://localhost:3000
npm install
npm run dev
```

## Environment variables

### Backend (Render)

| Key | Value |
|---|---|
| `SUPABASE_URL` | From Supabase project settings |
| `SUPABASE_SERVICE_KEY` | Service role key (not anon) |
| `PORT` | 3000 |
| `NODE_VERSION` | 22.11.0 |
| `NPM_CONFIG_PRODUCTION` | false |

### Frontend (Netlify)

| Key | Value |
|---|---|
| `VITE_API_URL` | Your Render backend URL |

## API endpoints

| Method | Path | Description |
|---|---|---|
| GET | /health | Health check |
| GET | /api/packs | All packs |
| GET | /api/packs/:id | Pack with blocks |
| POST | /api/sessions/sync | Bulk sync session events |
| GET | /api/sessions/recent | Last 20 synced events |

## Database setup

Run `supabase-schema.sql` in your Supabase SQL editor.

## Production context

This is a standalone reimplementation of the offline-first runtime powering Neareo — a no-code app platform serving cultural institutions across Spain, France, and Belgium. The production system (sw_v_1.4.9.js + bot_v_5.8.9.13.js + mediastore_v_3.2.0.js) handles encrypted scenario data, multi-language TTS, and chunked media blobs for 30+ live apps.
