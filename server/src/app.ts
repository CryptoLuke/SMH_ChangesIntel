import express from "express";
import type { Request } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import basicAuth from "express-basic-auth";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runsRouter } from "./routes/runs.js";
import { revertRouter } from "./routes/revert.js";
import { loadDashboardUsers, toBasicAuthUsers, toRoleLookup } from "./auth/users.js";
import { requireRole } from "./auth/requireRole.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  // Standard security headers (CSP, X-Frame-Options, etc.) — sane defaults
  // out of the box, no custom config needed for this app's shape.
  app.use(helmet());

  const isProduction = process.env.NODE_ENV === "production";

  // --- Auth gate ---
  // Everything below this line — dashboard included — requires a login.
  // Without it, anyone who finds the URL could trigger a run using whatever
  // ISC credentials they type into the form themselves.
  //
  // Supports multiple named users, each with a role (DASHBOARD_USERS_JSON),
  // falling back to the legacy single DASHBOARD_USER/DASHBOARD_PASSWORD pair
  // (treated as one implicit admin) so an existing deployment isn't broken
  // by this change. See auth/users.ts for the exact format.
  let dashboardUsers;
  try {
    dashboardUsers = loadDashboardUsers();
  } catch (err) {
    throw new Error(`Invalid dashboard user configuration: ${err instanceof Error ? err.message : err}`);
  }

  if (isProduction && dashboardUsers.length === 0) {
    // Fail fast rather than silently boot an unprotected app on a public host.
    throw new Error(
      "No dashboard users configured. Set DASHBOARD_USERS_JSON (or the legacy " +
        "DASHBOARD_USER/DASHBOARD_PASSWORD pair) as environment variables before deploying."
    );
  }

  if (dashboardUsers.length > 0) {
    const roleByUsername = toRoleLookup(dashboardUsers);

    app.use(
      basicAuth({
        users: toBasicAuthUsers(dashboardUsers),
        challenge: true, // triggers the browser's native login prompt
        unauthorizedResponse: () =>
          "Authentication required. Enter your dashboard username/password when prompted.",
      })
    );

    // Attaches the authenticated user's role for requireRole() to check
    // downstream. Runs after basicAuth, so req.auth.user is already set.
    app.use((req, _res, next) => {
      const username = (req as Request & { auth?: { user: string } }).auth?.user;
      req.userRole = username ? roleByUsername[username] : undefined;
      next();
    });

    app.get("/api/whoami", (req, res) => {
      const username = (req as Request & { auth?: { user: string } }).auth?.user;
      res.json({ username, role: req.userRole });
    });
  } else {
    console.warn(
      "WARNING: no dashboard users configured — running without authentication. " +
        "This is only acceptable for local development."
    );
    // No auth configured locally — /api/whoami still needs to exist so the
    // client doesn't break; report an implicit admin so local dev isn't
    // artificially restricted.
    app.get("/api/whoami", (_req, res) => res.json({ username: "dev", role: "admin" }));
  }

  // In production the client is served from the same origin (see below),
  // so CORS is only needed for local dev where Vite runs on its own port.
  if (!isProduction) {
    app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173" }));
  }

  app.use(express.json());

  // Rate limit the run-triggering endpoint specifically — it's the
  // expensive one (proxies to the ISC tenant) and the one worth protecting
  // from accidental hammering or abuse.
  const runsLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use("/api/runs", runsLimiter, runsRouter);

  // Revert is the one endpoint that writes to a live tenant — admin only,
  // enforced server-side (see requireRole's own note on why the frontend
  // hiding this for read-only users is a UX nicety, not the real boundary).
  // Same rate limit rationale as /api/runs — it calls out to ISC too.
  app.use("/api/revert", runsLimiter, requireRole("admin"), revertRouter);

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  // Serve the built React app in production (npm run build in client/ first).
  const clientDist = path.resolve(__dirname, "../../client/dist");
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"), (err) => {
      if (err) res.status(404).send("Frontend not built — run npm run build in client/ first.");
    });
  });

  return app;
}
