# ISC change intelligence

Collects a full snapshot of an Identity Security Cloud (ISC) tenant's
config objects, diffs it against a prior snapshot, and shows the result
in a dashboard. Two ways in: a CLI for quick command-line runs, and a
web app (API + React dashboard) for everything else.

## Structure

```
server/          Express API + the collection/diff engine + CLI
  src/engine/    auth, ISC client, collectors, snapshot store, diff engine,
                 run store — shared by both the API and the CLI
  src/routes/    Express routes (POST /api/runs, GET /api/runs, ...)
  src/cli.ts     command-line entrypoint (env-var driven)
  src/server.ts  API server entrypoint
client/          React (Vite) dashboard — new-run form + changelog view
```

## Credential handling

Client ID/Secret are entered fresh for every run — in the CLI via
environment variables you set at run time, in the dashboard via the
"New run" form. Neither path writes them to disk or logs them; they exist
only for the duration of the request that exchanges them for a bearer
token. See `server/src/cli.ts` and `server/src/routes/runs.ts` for the
exact boundary — that's the only place credentials ever touch this codebase.

This app is meant to be deployed later, so if you eventually want scheduled
/ unattended runs, that's the one seam to change: swap the form/env-var
credential input for a call to a secrets manager. Nothing else in the
pipeline needs to change.

## Running the CLI

```bash
cd server
npm install
npm run build

ISC_BASE_URL=https://your-org.api.identitynow.com \
ISC_CLIENT_ID=your-client-id \
ISC_CLIENT_SECRET=your-client-secret \
ISC_SCOPE=sources,access-profiles,workflows \
ISC_LOOKBACK_DAYS=7 \
npm run cli
```

- `ISC_SCOPE` — comma-separated object types. Defaults to
  `sources,access-profiles,workflows`. Valid: `sources`, `access-profiles`,
  `roles`, `entitlements`, `workflows`.
- `ISC_LOOKBACK_DAYS` — optional. Diffs against the closest snapshot at
  least N days old, falling back to the oldest available with a logged
  note if you don't have that much history yet. Omit to just compare
  against whatever the last run happened to be.

First run establishes a baseline (nothing to diff yet). CLI runs are saved
the same way dashboard runs are, so they show up in the dashboard too if
the API server is running.

## Running the dashboard app

Two processes, in dev:

```bash
# terminal 1 — API
cd server
npm install
npm run build
npm run dev          # http://localhost:3001

# terminal 2 — dashboard
cd client
npm install
npm run dev           # http://localhost:5173, proxies /api to :3001
```

Open http://localhost:5173. Use "New run" to enter the tenant base URL,
Client ID/Secret, pick object types and (optionally) a trace-back window,
then run. Results land in the changelog view — grouped by object type,
color-coded by added/removed/modified, click a row to expand field-level
diffs.

For local dev, `DASHBOARD_USER`/`DASHBOARD_PASSWORD` are optional — if
unset, the API runs without auth and logs a warning. Set them (in
terminal 1, alongside the other env vars) to test the login flow locally
before deploying:

```bash
DASHBOARD_USER=admin DASHBOARD_PASSWORD=devpassword npm run dev
```

### Production / deployment

```bash
cd client && npm run build     # outputs client/dist
cd ../server && npm run build && npm start
```

In production the API server serves the built React app itself (see
`server/src/app.ts`) — one process, one port. Point `PORT` at whatever
your host expects. The snapshot and run stores are plain JSON files under
`server/snapshots/` and `server/runs/` — fine for a single instance, but
swap them for a real database (see the comments at the top of
`snapshotStore.ts` and `runStore.ts` for the target schema) before running
this anywhere with more than one instance or you'll get inconsistent state.

## Testing it without touching your tenant

There's no bundled mock server (removed on request) — the quickest way to
verify the pipeline end-to-end without live credentials is to point
`ISC_BASE_URL` / the dashboard form at any local HTTP server that responds
to `POST /oauth/token` with `{ access_token, expires_in }` and to
`GET /v3/<object-type>?limit=&offset=` with a JSON array. Ask if you'd like
one built back in for local testing.

## Security

Two separate concerns, both handled:

**In transit** — credentials never travel unencrypted. Deploy behind any
platform that terminates TLS automatically (Railway, Render, Fly.io all do
this on every deploy, free, via Let's Encrypt). As long as you access the
app over `https://`, the Client ID/Secret typed into the "New run" form —
and the bearer token exchanged with your ISC tenant — are encrypted for
the whole trip. Nothing in this app needs to change for that; it's a
platform property.

**At the app/hosting boundary** — this is what actually needed building:

- **Login required, with roles.** Every route, including the dashboard
  itself, sits behind HTTP Basic Auth. Set `DASHBOARD_USERS_JSON` — a JSON
  array of named users, each with a role:
  ```
  DASHBOARD_USERS_JSON=[{"username":"admin","password":"...","role":"admin"},{"username":"viewer","password":"...","role":"read-only"}]
  ```
  `read-only` users can view the dashboard, browse run history, and
  trigger new collection runs (those only read from ISC). `admin` is
  required for anything that would write back to your tenant (rollback,
  once built) — enforced server-side via a `requireRole()` guard on those
  routes specifically, not just hidden in the UI. Add as many users of
  either role as you need; nothing else changes.

  Backward compatible: if `DASHBOARD_USERS_JSON` isn't set, the older
  `DASHBOARD_USER`/`DASHBOARD_PASSWORD` pair still works, treated as a
  single implicit admin — so an existing deployment isn't broken by this.
  In production the app refuses to start if neither is set — it fails
  loudly rather than silently booting unprotected.
- **Standard security headers** via Helmet (CSP, X-Frame-Options,
  X-Content-Type-Options, etc.) — sane defaults, no custom config needed.
- **Rate limiting** on `/api/runs` — 20 requests per 15 minutes per IP,
  since that's the endpoint that actually calls out to your ISC tenant.
- **Managed hosting** (as opposed to a self-run VPS) means the platform
  patches the OS and manages network exposure — less for you to secure
  directly.

Client ID/Secret themselves are still never persisted anywhere (see
"Credential handling" above) — that hasn't changed, this just adds a lock
on the door in front of it.

## Deploying (Railway, Render, or similar)

These platforms auto-detect a root `package.json` with `build`/`start`
scripts — already set up at the repo root, so in most cases you just:

1. Connect the repo.
2. Set environment variables: `DASHBOARD_USERS_JSON` (or the legacy
   `DASHBOARD_USER`/`DASHBOARD_PASSWORD` pair), `NODE_ENV=production`.
   (`PORT` is usually supplied automatically by the platform — the app
   already reads `process.env.PORT`.)
3. Deploy. Build command `npm run build`, start command `npm start` —
   both already defined at the repo root.

One thing to know: snapshot/run storage is still plain JSON files on
local disk — but the location is configurable via `DATA_DIR` specifically
so it can live outside the app's own code directory. Set `DATA_DIR` to a
mounted persistent volume's path (Railway, Render, and Fly.io all offer
these) and attach a volume there — check your platform's docs for how.
Without `DATA_DIR` set, storage defaults to `server/snapshots/` and
`server/runs/` relative to wherever the process starts, which is fine
locally but won't survive a redeploy on most platforms. Migrating to a
real database (see "Next steps" below) removes this requirement
entirely and is worth doing before this becomes something you rely on
day to day.

## Next steps

- Swap file-based snapshot/run storage for Postgres before any real
  deployment with concurrent access.
- Decide the credential path for scheduled/unattended runs (vault vs.
  staying user-triggered) and wire it into `cli.ts` / `routes/runs.ts`.
- Expand `engine/collectors/registry.ts` scope (identity profiles,
  transforms, certifications, SoD violations, etc.) as needed.
- Add auth to the dashboard itself before deploying anywhere shared —
  right now anyone who can reach the app can trigger a run with whatever
  credentials they type in.
