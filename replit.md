# NutriPlan Pro

Static HTML web app (clinical nutrition tool, Italian) backed by Supabase, originally deployed on Vercel as serverless functions. Migrated to Replit using a small Express server that:

- Serves the static HTML/CSS/JS from the project root.
- Exposes the original `api/*.js` handlers under `/api/:name` (Vercel-style `(req, res)` handlers).
- Applies the same security headers (CSP, HSTS in production, etc.) the original `vercel.json` configured.

## Run

- `npm start` → `node server.js` on `0.0.0.0:5000` (used by the "Start application" workflow).

## Project Layout

- `server.js` — Express server + API router.
- `api/` — Per-endpoint handlers (Groq AI proxy, Supabase calendar feed, calendar token, page-fetch proxy, public config).
- `*.html`, `css/`, `js/` — Static frontend.
- `supabase/` — SQL migrations (informational).

## Environment Variables

Set these via Replit's Secrets tool. The app starts without them, but related endpoints will return errors.

- `GEMINI_API_KEY` — Groq API key (used by `/api/claude` and `/api/gemini`).
- `GOOGLE_CLIENT_ID` — Google OAuth client ID (returned by `/api/config`).
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` — override the embedded public Supabase project values if needed.
- `SUPABASE_SERVICE_KEY` — optional; enables direct table access in `/api/calendar` (otherwise the SECURITY DEFINER RPC is used).
- `CALENDAR_SECRET` — HMAC secret for signed calendar feed URLs.
- `ALLOWED_ORIGIN` — comma-separated list of origins allowed for CORS on the AI/proxy endpoints.

## Notes

- API handlers were authored as Vercel functions; two CommonJS handlers (`calendar.js`, `calendar-token.js`) were converted to ESM so they can be imported by the Express router (the package is `"type": "module"`).
- `vercel.json` is kept for reference but is not used at runtime.
