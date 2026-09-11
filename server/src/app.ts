import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import session from "express-session";
import FileStoreFactory from "session-file-store";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runsRouter } from "./routes/runs.js";
import { revertRouter } from "./routes/revert.js";
import { authRouter } from "./routes/auth.js";
import { ownerRouter } from "./routes/owner.js";
import { requireLogin, requireRole } from "./auth/requireRole.js";
import "./auth/session.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FileStore = FileStoreFactory(session);

export function createApp() {
  const app = express();
  const isProduction = process.env.NODE_ENV === "production";

  // Trust the platform's reverse proxy (Railway, etc.) so Express correctly
  // sees requests as HTTPS — required for cookie.secure to work at all.
  // Without this, secure cookies silently never get set behind a proxy.
  if (isProduction) app.set("trust proxy", 1);

  app.use(helmet());

  if (!isProduction) {
    app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173", credentials: true }));
  }

  const sessionSecret = process.env.SESSION_SECRET;
  if (isProduction && !sessionSecret) {
    throw new Error(
      "SESSION_SECRET must be set in production. Set it as an environment variable on your hosting platform " +
        "before deploying — any long random string works."
    );
  }

  app.use(
    session({
      store: new FileStore({
        path: path.resolve(process.env.DATA_DIR ?? process.cwd(), "sessions"),
        logFn: () => {}, // the default logs every read/write to stdout — too noisy
      }),
      secret: sessionSecret ?? "dev-only-secret-not-for-production",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      },
    })
  );

  app.use(express.json());

  // Brute-force protection on the endpoints that check a password.
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use("/api/auth/login", authLimiter);
  app.use("/api/owner/login", authLimiter);
  app.use("/api/workspaces", authLimiter); // covers both check and create

  app.use("/api", authRouter);
  app.use("/api/owner", ownerRouter);

  // Rate limit the run-triggering/revert endpoints specifically — they're
  // the ones that actually call out to an ISC tenant.
  const runsLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use("/api/runs", requireLogin, runsLimiter, runsRouter);
  app.use("/api/revert", requireLogin, runsLimiter, requireRole("admin"), revertRouter);

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  // Static files are deliberately NOT gated — the SPA itself renders the
  // unauthenticated "select or create workspace" screen, discovering
  // session state by calling /api/auth/whoami on load. Everything that
  // actually matters (runs, revert, workspace user management) is gated
  // above, per-route.
  const clientDist = path.resolve(__dirname, "../../client/dist");
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"), (err) => {
      if (err) res.status(404).send("Frontend not built — run npm run build in client/ first.");
    });
  });

  return app;
}
