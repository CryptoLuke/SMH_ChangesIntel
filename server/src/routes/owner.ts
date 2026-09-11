import { Router } from "express";
import { listWorkspacesSummary } from "../auth/workspaceStore.js";
import { requireOwner } from "../auth/requireRole.js";
import "../auth/session.js";

export const ownerRouter = Router();

/**
 * Owner identity is a single, separate credential pair (OWNER_USERNAME /
 * OWNER_PASSWORD env vars) — not a workspace user, and not stored in the
 * workspace user files. There's only ever one owner, so this doesn't need
 * the fancier per-workspace user store.
 */
ownerRouter.post("/login", (req, res) => {
  const { username, password } = req.body as Partial<{ username: string; password: string }>;
  const ownerUsername = process.env.OWNER_USERNAME;
  const ownerPassword = process.env.OWNER_PASSWORD;

  if (!ownerUsername || !ownerPassword) {
    return res.status(503).json({ error: "Owner access is not configured on this deployment." });
  }
  if (username !== ownerUsername || password !== ownerPassword) {
    return res.status(401).json({ error: "Incorrect username or password." });
  }
  req.session.isOwner = true;
  res.status(204).end();
});

/** Name, base URL, creation date, and user count only — never run data or
 *  actual user credentials. See workspaceStore.listWorkspacesSummary. */
ownerRouter.get("/workspaces", requireOwner, async (_req, res) => {
  res.json(await listWorkspacesSummary());
});
