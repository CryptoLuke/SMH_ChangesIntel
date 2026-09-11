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

Two different things are handled differently:

- **ISC Client ID/Secret** (what actually talks to your tenant) are entered
  fresh for every run and every revert — never stored, never logged. See
  `server/src/routes/runs.ts` and `routes/revert.ts` for the exact
  boundary — that's the only place they ever touch this codebase.
- **Dashboard login** (who can open the app at all) is now a real account
  system — see "Workspaces" below. This was previously a single shared
  password; it isn't anymore.

## Workspaces

Each ISC tenant is a **workspace** — a first-class registered thing, not
just a string inferred from whatever URL someone happened to type. A
workspace's identity is its base URL, which must match one of:

```
https://<org>.api.identitynow.com
https://<org>.api.identitynow-demo.com
```

The `<org>` part is what everything else in the app calls the tenant name.

**How people get in:**
1. Open the app → enter the tenant's base URL.
2. If a workspace already exists for it → log in with a provisioned
   username/password.
3. If not → set one up on the spot; whoever creates it becomes its first
   admin.

Users are scoped to their workspace — logging into one workspace never
shows you another's runs. Admins can add more users (either role) to their
own workspace via the "Workspace users" panel in the sidebar; there's no
cross-workspace user management by design.

**Roles**, same idea as before: `read-only` can view everything and
trigger new collection runs (those only read from ISC); `admin` is
additionally required for anything that writes back to your tenant
(revert) or manages the workspace itself (adding users, deleting it).

**Owner panel** — a single separate login (`OWNER_USERNAME`/
`OWNER_PASSWORD` env vars, not tied to any workspace) for a monitoring-only
view of every workspace that's been created: name, base URL, creation
date, user count. No drill-down into actual run data — it's oversight, not
access.

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

Open http://localhost:5173. Enter a tenant base URL to set up a workspace
(first time) or log in (if one already exists) — see "Workspaces" above.
Once in, "New run" only asks for Client ID/Secret, object types, and an
optional trace-back window — the base URL is fixed by the workspace you're
logged into. Results land in the changelog view — grouped by object type,
color-coded by added/removed/modified, click a row to expand field-level
diffs.

Set `SESSION_SECRET` (any long random string) in terminal 1 alongside the
other env vars — required for login sessions to work at all:

```bash
SESSION_SECRET=any-random-string npm run dev
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

- **Login required, session-based.** Every API route except the ones that
  bootstrap a session (`/api/workspaces/check`, `/api/workspaces` create,
  `/api/auth/login`, `/api/owner/login`) requires a valid session cookie.
  Static files (the page shell itself) are deliberately public, since the
  app needs to render its own login screen before any session exists —
  the API is where enforcement actually happens.
- **Passwords are hashed** (bcrypt) in the per-workspace user store —
  never plaintext, never in an env var, unlike the old shared-password
  model.
- **Sessions persist to disk** (`session-file-store`, under `DATA_DIR`),
  so a redeploy doesn't silently log everyone out.
- **Role enforcement is server-side**, via a `requireRole()` guard on the
  actual write-capable routes (revert, delete, add-user) — not just
  hidden in the UI.
- **Standard security headers** via Helmet (CSP, X-Frame-Options,
  X-Content-Type-Options, etc.) — sane defaults, no custom config needed.
- **Rate limiting** on `/api/runs`, `/api/revert`, and the login endpoints
  specifically — the ones worth protecting from brute-forcing or hammering
  a live ISC tenant.
- **Managed hosting** (as opposed to a self-run VPS) means the platform
  patches the OS and manages network exposure — less for you to secure
  directly.

Client ID/Secret themselves are still never persisted anywhere (see
"Credential handling" above) — that hasn't changed, this just adds a lock
on the door in front of the app itself.

## Deploying (Railway, Render, or similar)

These platforms auto-detect a root `package.json` with `build`/`start`
scripts — already set up at the repo root, so in most cases you just:

1. Connect the repo.
2. Set environment variables: `SESSION_SECRET` (required — any long random
   string), `NODE_ENV=production`, and optionally `OWNER_USERNAME`/
   `OWNER_PASSWORD` if you want the owner monitoring panel.
   (`PORT` is usually supplied automatically by the platform — the app
   already reads `process.env.PORT`.)
3. Deploy. Build command `npm run build`, start command `npm start` —
   both already defined at the repo root.

### Migrating from the old single-tenant setup

If you were already running this with `DASHBOARD_USER`/
`DASHBOARD_USERS_JSON`, that model is gone — replaced entirely by
workspaces. Nothing auto-migrates your login credentials, but your actual
run/snapshot history isn't lost: it's already stored under your tenant's
org name, which is exactly what a workspace's identity is too. To pick up
where you left off:

1. Deploy this version.
2. Open the app, enter your tenant's base URL — since no workspace is
   registered yet, you'll land on the "create workspace" step.
3. Create it with a new username/password of your choosing. As soon as
   it's created, your existing runs and snapshots for that org name become
   visible again — they were never touched, just waiting for a workspace
   record to attach to.
4. Remove the now-unused `DASHBOARD_USER`/`DASHBOARD_USERS_JSON` variables
   from your hosting platform.

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

- Swap file-based storage (snapshots, runs, workspaces, sessions) for
  Postgres before any real deployment with concurrent access.
- Decide the credential path for scheduled/unattended runs (vault vs.
  staying user-triggered) — still open, discussed but not built.
- Expand `engine/collectors/registry.ts` scope (identity profiles,
  transforms, certifications, SoD violations, etc.) as needed.
- The CLI (`cli.ts`) still reads `ISC_BASE_URL`/`ISC_CLIENT_ID`/
  `ISC_CLIENT_SECRET` from env vars independent of the workspace model —
  it writes data that becomes visible once a matching workspace exists,
  but doesn't go through workspace auth itself. Worth revisiting if the
  CLI needs the same access boundaries as the web app.
