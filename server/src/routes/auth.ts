import { Router } from "express";
import {
  extractOrgName,
  getWorkspace,
  createWorkspace,
  verifyWorkspaceLogin,
  addWorkspaceUser,
  removeWorkspaceUser,
  listWorkspaceUsers,
  deleteWorkspace,
} from "../auth/workspaceStore.js";
import { deleteAllSnapshotsForTenant } from "../engine/snapshotStore.js";
import { deleteRunsForTenant } from "../engine/runStore.js";
import { requireRole } from "../auth/requireRole.js";
import "../auth/session.js";

export const authRouter = Router();

/**
 * Public — used by the landing page before any login exists, to decide
 * whether to show a login form or a "create this workspace" form. Returns
 * existence only, never workspace details (base URL, user list, etc.) —
 * those stay behind actual login.
 */
authRouter.post("/workspaces/check", async (req, res) => {
  const baseUrl = (req.body as { baseUrl?: unknown }).baseUrl;
  if (typeof baseUrl !== "string") {
    return res.status(400).json({ error: "baseUrl is required" });
  }
  const orgName = extractOrgName(baseUrl);
  if (!orgName) {
    return res.status(400).json({
      error:
        "That doesn't look like an ISC tenant URL. Expected https://<org>.api.identitynow.com or https://<org>.api.identitynow-demo.com",
    });
  }
  const exists = (await getWorkspace(orgName)) !== null;
  res.json({ exists, orgName });
});

/**
 * Public — creates a new workspace with its first admin user, then
 * immediately logs that admin in (no separate login step needed right
 * after creating your own workspace).
 */
authRouter.post("/workspaces", async (req, res) => {
  const { baseUrl, username, password } = req.body as Partial<{
    baseUrl: string;
    username: string;
    password: string;
  }>;
  if (!baseUrl || !username || !password) {
    return res.status(400).json({ error: "baseUrl, username, and password are required" });
  }
  const result = await createWorkspace(baseUrl, username, password);
  if ("error" in result) return res.status(400).json({ error: result.error });

  req.session.user = { orgName: result.workspace.orgName, username, role: "admin" };
  res.status(201).json({ orgName: result.workspace.orgName, username, role: "admin" });
});

/** Public — logs into an existing workspace. */
authRouter.post("/auth/login", async (req, res) => {
  const { orgName, username, password } = req.body as Partial<{
    orgName: string;
    username: string;
    password: string;
  }>;
  if (!orgName || !username || !password) {
    return res.status(400).json({ error: "orgName, username, and password are required" });
  }
  const user = await verifyWorkspaceLogin(orgName, username, password);
  if (!user) return res.status(401).json({ error: "Incorrect username or password." });

  req.session.user = { orgName, username: user.username, role: user.role };
  res.json({ orgName, username: user.username, role: user.role });
});

authRouter.post("/auth/logout", (req, res) => {
  req.session.destroy(() => res.status(204).end());
});

authRouter.get("/auth/whoami", (req, res) => {
  res.json(req.session.user ?? null);
});

/**
 * Admin-only, and deliberately takes no orgName from the request — the
 * target workspace is always the caller's own session, so there's no way
 * for an admin of one workspace to add a user to a different one.
 */
authRouter.post("/workspaces/users", requireRole("admin"), async (req, res) => {
  const { username, password, role } = req.body as Partial<{
    username: string;
    password: string;
    role: string;
  }>;
  if (!username || !password || (role !== "admin" && role !== "read-only")) {
    return res.status(400).json({ error: 'username, password, and role ("admin" or "read-only") are required' });
  }
  const orgName = req.session.user!.orgName;
  const result = await addWorkspaceUser(orgName, username, password, role);
  if ("error" in result) return res.status(400).json({ error: result.error });
  res.status(201).json({ ok: true });
});

/** Admin-only — lists the caller's own workspace's users (no password hashes). */
authRouter.get("/workspaces/users", requireRole("admin"), async (req, res) => {
  const orgName = req.session.user!.orgName;
  const users = await listWorkspaceUsers(orgName);
  res.json(users.map((u) => ({ username: u.username, role: u.role, createdAt: u.createdAt })));
});

/**
 * Admin-only, scoped to the caller's own workspace only (same pattern as
 * adding a user — no orgName parameter, so there's no way to remove a user
 * from a different workspace). Refuses to remove the last admin — see
 * workspaceStore.removeWorkspaceUser. If admins remove their own account,
 * their session is destroyed too, since it would otherwise keep working
 * against an account that no longer exists.
 */
authRouter.delete("/workspaces/users/:username", requireRole("admin"), async (req, res) => {
  const orgName = req.session.user!.orgName;
  const callerUsername = req.session.user!.username;
  const result = await removeWorkspaceUser(orgName, req.params.username);
  if ("error" in result) return res.status(400).json({ error: result.error });

  if (req.params.username === callerUsername) {
    return req.session.destroy(() => res.status(204).end());
  }
  res.status(204).end();
});

/**
 * Full "forget this workspace" — deletes every run, every snapshot, and the
 * workspace/user registration itself, then destroys the caller's own
 * session (there's nothing left to be logged into). Admin-only, and takes
 * no orgName parameter — always the caller's own workspace, never another.
 */
authRouter.delete("/workspaces", requireRole("admin"), async (req, res) => {
  const orgName = req.session.user!.orgName;
  const deletedRunCount = await deleteRunsForTenant(orgName);
  await deleteAllSnapshotsForTenant(orgName);
  await deleteWorkspace(orgName);
  req.session.destroy(() => res.json({ deletedRunCount }));
});
