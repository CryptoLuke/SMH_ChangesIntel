import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import basicAuth from "express-basic-auth";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runsRouter } from "./routes/runs.js";

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
  const authUser = process.env.DASHBOARD_USER;
  const authPassword = process.env.DASHBOARD_PASSWORD;

  if (isProduction && (!authUser || !authPassword)) {
    // Fail fast rather than silently boot an unprotected app on a public host.
    throw new Error(
      "DASHBOARD_USER and DASHBOARD_PASSWORD must both be set in production. " +
        "Set them as environment variables in your hosting platform before deploying."
    );
  }

  if (authUser && authPassword) {
    app.use(
      basicAuth({
        users: { [authUser]: authPassword },
        challenge: true, // triggers the browser's native login prompt
        unauthorizedResponse: () =>
          "Authentication required. Enter the DASHBOARD_USER / DASHBOARD_PASSWORD credentials when prompted.",
      })
    );
  } else {
    console.warn(
      "WARNING: DASHBOARD_USER/DASHBOARD_PASSWORD not set — running without authentication. " +
        "This is only acceptable for local development."
    );
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
