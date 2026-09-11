import { mkdir, readdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";

/**
 * A "workspace" is a registered SailPoint ISC tenant. The org name extracted
 * from its base URL is the identifier used everywhere else in the app —
 * it's exactly what today's snapshot/run storage already calls "tenant".
 * This module adds a formal registration step in front of that: a workspace
 * must be created (with its first admin user) before any runs can happen
 * against it, and login is checked against that specific workspace's user
 * list, not a single global list.
 */

export interface Workspace {
  orgName: string;
  baseUrl: string;
  createdAt: string;
}

export type Role = "admin" | "read-only";

export interface WorkspaceUser {
  username: string;
  passwordHash: string;
  role: Role;
  createdAt: string;
}

const WORKSPACES_ROOT = path.resolve(process.env.DATA_DIR ?? process.cwd(), "workspaces");

function sanitize(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function workspaceDir(orgName: string): string {
  return path.join(WORKSPACES_ROOT, sanitize(orgName));
}

/**
 * Validates a tenant base URL against SailPoint ISC's two real domain
 * patterns (production and demo) and extracts the org name. Rejects
 * anything else — http://, extra path segments, a multi-label subdomain,
 * or a URL that isn't ISC at all. Case-insensitive; the returned org name
 * is always lowercase, since hostnames are case-insensitive and we don't
 * want "Acme" and "acme" registering as two different workspaces.
 */
export function extractOrgName(rawUrl: string): string | null {
  const url = rawUrl.trim().replace(/\/+$/, "");
  const match = url.match(/^https:\/\/([a-zA-Z0-9-]+)\.api\.identitynow(?:-demo)?\.com$/i);
  return match ? match[1].toLowerCase() : null;
}

export async function getWorkspace(orgName: string): Promise<Workspace | null> {
  try {
    const raw = await readFile(path.join(workspaceDir(orgName), "workspace.json"), "utf-8");
    return JSON.parse(raw) as Workspace;
  } catch {
    return null;
  }
}

/** Used by the owner panel — name/created/user-count only, never user
 *  credentials or run data. */
export async function listWorkspacesSummary(): Promise<
  { orgName: string; baseUrl: string; createdAt: string; userCount: number }[]
> {
  let dirs: string[];
  try {
    dirs = await readdir(WORKSPACES_ROOT);
  } catch {
    return [];
  }
  const summaries = await Promise.all(
    dirs.map(async (d) => {
      const workspace = await getWorkspace(d);
      if (!workspace) return null;
      const users = await listWorkspaceUsers(workspace.orgName);
      return { ...workspace, userCount: users.length };
    })
  );
  return summaries
    .filter((w): w is NonNullable<typeof w> => w !== null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function createWorkspace(
  baseUrl: string,
  initialAdminUsername: string,
  initialAdminPassword: string
): Promise<{ workspace: Workspace } | { error: string }> {
  const orgName = extractOrgName(baseUrl);
  if (!orgName) {
    return {
      error:
        "Base URL must look like https://<org>.api.identitynow.com or https://<org>.api.identitynow-demo.com",
    };
  }
  if (await getWorkspace(orgName)) {
    return { error: `A workspace for "${orgName}" already exists.` };
  }
  if (!initialAdminUsername || !initialAdminPassword) {
    return { error: "An initial admin username and password are required." };
  }

  const dir = workspaceDir(orgName);
  await mkdir(dir, { recursive: true });
  const workspace: Workspace = {
    orgName,
    baseUrl: baseUrl.trim().replace(/\/+$/, ""),
    createdAt: new Date().toISOString(),
  };
  await writeFile(path.join(dir, "workspace.json"), JSON.stringify(workspace, null, 2), "utf-8");

  const passwordHash = await bcrypt.hash(initialAdminPassword, 10);
  const users: WorkspaceUser[] = [
    { username: initialAdminUsername, passwordHash, role: "admin", createdAt: new Date().toISOString() },
  ];
  await writeFile(path.join(dir, "users.json"), JSON.stringify(users, null, 2), "utf-8");

  return { workspace };
}

export async function listWorkspaceUsers(orgName: string): Promise<WorkspaceUser[]> {
  try {
    const raw = await readFile(path.join(workspaceDir(orgName), "users.json"), "utf-8");
    return JSON.parse(raw) as WorkspaceUser[];
  } catch {
    return [];
  }
}

export async function addWorkspaceUser(
  orgName: string,
  username: string,
  password: string,
  role: Role
): Promise<{ ok: true } | { error: string }> {
  if (!(await getWorkspace(orgName))) return { error: "Workspace not found" };
  const users = await listWorkspaceUsers(orgName);
  if (users.some((u) => u.username === username)) {
    return { error: `"${username}" already exists in this workspace.` };
  }
  if (!username || !password) {
    return { error: "Username and password are required." };
  }
  const passwordHash = await bcrypt.hash(password, 10);
  users.push({ username, passwordHash, role, createdAt: new Date().toISOString() });
  await writeFile(path.join(workspaceDir(orgName), "users.json"), JSON.stringify(users, null, 2), "utf-8");
  return { ok: true };
}

/**
 * Removes a user from a workspace. Refuses to remove the workspace's last
 * admin — that would permanently lock everyone out of admin-only actions
 * (adding users, deleting the workspace) with no way back short of the
 * owner... who has no workspace-management access by design. Better to
 * block it here than create an unrecoverable state.
 */
export async function removeWorkspaceUser(
  orgName: string,
  username: string
): Promise<{ ok: true } | { error: string }> {
  const users = await listWorkspaceUsers(orgName);
  const target = users.find((u) => u.username === username);
  if (!target) return { error: `"${username}" is not a user in this workspace.` };

  const remainingAdmins = users.filter((u) => u.role === "admin" && u.username !== username);
  if (target.role === "admin" && remainingAdmins.length === 0) {
    return { error: "Can't remove the last admin — the workspace would have no one able to manage it." };
  }

  const updated = users.filter((u) => u.username !== username);
  await writeFile(path.join(workspaceDir(orgName), "users.json"), JSON.stringify(updated, null, 2), "utf-8");
  return { ok: true };
}

export async function verifyWorkspaceLogin(
  orgName: string,
  username: string,
  password: string
): Promise<WorkspaceUser | null> {
  const users = await listWorkspaceUsers(orgName);
  const user = users.find((u) => u.username === username);
  if (!user) return null;
  return (await bcrypt.compare(password, user.passwordHash)) ? user : null;
}

/** Full "forget this workspace" — pairs with the existing run/snapshot
 *  deletion for the same org name. Admin-only, enforced by the route. */
export async function deleteWorkspace(orgName: string): Promise<void> {
  await rm(workspaceDir(orgName), { recursive: true, force: true });
}
