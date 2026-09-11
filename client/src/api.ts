import type { ObjectType, RunReport, RunSummary } from "./types";

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

// --- Workspace / session auth ---

export interface WhoAmI {
  orgName?: string;
  username?: string;
  role?: "admin" | "read-only";
}

export async function getWhoAmI(): Promise<WhoAmI> {
  const res = await fetch("/api/auth/whoami", { credentials: "same-origin" });
  const body = await handle<WhoAmI | null>(res);
  return body ?? {};
}

export async function checkWorkspace(baseUrl: string): Promise<{ exists: boolean; orgName: string }> {
  const res = await fetch("/api/workspaces/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ baseUrl }),
  });
  return handle(res);
}

export async function createWorkspace(baseUrl: string, username: string, password: string): Promise<WhoAmI> {
  const res = await fetch("/api/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ baseUrl, username, password }),
  });
  return handle(res);
}

export async function login(orgName: string, username: string, password: string): Promise<WhoAmI> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ orgName, username, password }),
  });
  return handle(res);
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
}

// --- Owner panel (separate identity from any workspace) ---

export interface WorkspaceSummary {
  orgName: string;
  baseUrl: string;
  createdAt: string;
  userCount: number;
}

export async function getOwnerWhoAmI(): Promise<boolean> {
  const res = await fetch("/api/owner/whoami", { credentials: "same-origin" });
  const body = await handle<{ isOwner: boolean }>(res);
  return body.isOwner;
}

export async function ownerLogin(username: string, password: string): Promise<void> {
  const res = await fetch("/api/owner/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
}

export async function ownerLogout(): Promise<void> {
  await fetch("/api/owner/logout", { method: "POST", credentials: "same-origin" });
}

export async function listAllWorkspaces(): Promise<WorkspaceSummary[]> {
  const res = await fetch("/api/owner/workspaces", { credentials: "same-origin" });
  return handle(res);
}

export interface WorkspaceUserSummary {
  username: string;
  role: "admin" | "read-only";
  createdAt: string;
}

export async function listWorkspaceUsers(): Promise<WorkspaceUserSummary[]> {
  const res = await fetch("/api/workspaces/users", { credentials: "same-origin" });
  return handle(res);
}

export async function addWorkspaceUser(username: string, password: string, role: "admin" | "read-only"): Promise<void> {
  const res = await fetch("/api/workspaces/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ username, password, role }),
  });
  await handle(res);
}

export async function removeWorkspaceUser(username: string): Promise<void> {
  const res = await fetch(`/api/workspaces/users/${encodeURIComponent(username)}`, {
    method: "DELETE",
    credentials: "same-origin",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
}

/** Deletes the caller's own workspace entirely — runs, snapshots, users,
 *  the workspace registration itself. No parameter: always your own. */
export async function deleteWorkspace(): Promise<{ deletedRunCount: number }> {
  const res = await fetch("/api/workspaces", { method: "DELETE", credentials: "same-origin" });
  return handle(res);
}

// --- Runs ---

export interface TriggerRunInput {
  clientId: string;
  clientSecret: string;
  scope: ObjectType[];
  lookbackDays?: number;
  name?: string;
}

/**
 * Credentials passed here go straight into the POST body and are held by
 * the browser only for the duration of this call — nothing in this module
 * stores them, and the caller is responsible for clearing its own form
 * state after the request resolves. baseUrl is no longer part of this —
 * the server derives it from your logged-in workspace.
 */
export async function triggerRun(input: TriggerRunInput): Promise<RunReport> {
  const res = await fetch("/api/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(input),
  });
  return handle<RunReport>(res);
}

export async function listRuns(): Promise<RunSummary[]> {
  const res = await fetch("/api/runs", { credentials: "same-origin" });
  return handle<RunSummary[]>(res);
}

export async function getRun(id: string): Promise<RunReport> {
  const res = await fetch(`/api/runs/${id}`, { credentials: "same-origin" });
  return handle<RunReport>(res);
}

export async function renameRun(id: string, name: string): Promise<RunReport> {
  const res = await fetch(`/api/runs/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ name }),
  });
  return handle<RunReport>(res);
}

/** DELETE returns 204 No Content on success — no body to parse, unlike
 *  every other endpoint here, so this doesn't go through handle(). */
export async function deleteRun(id: string): Promise<void> {
  const res = await fetch(`/api/runs/${id}`, { method: "DELETE", credentials: "same-origin" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
}

export interface ActorLookupInput {
  runId: string;
  objectType: ObjectType;
  objectId: string;
  clientId: string;
  clientSecret: string;
}

export type ActorLookupResult =
  | { kind: "found"; actorName: string; eventName: string; createdAt: string }
  | { kind: "not-found" }
  | { kind: "error"; message: string };

/** Read-only against ISC — no dryRun/apply distinction needed, unlike
 *  revert. Available to both roles, same as triggering a run. */
export async function lookupActor(input: ActorLookupInput): Promise<ActorLookupResult> {
  const { runId, ...body } = input;
  const res = await fetch(`/api/runs/${runId}/actor`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { kind: "error", message: json.error ?? `Request failed (${res.status})` };
  if (!json.found) return { kind: "not-found" };
  return { kind: "found", actorName: json.actorName, eventName: json.eventName, createdAt: json.createdAt };
}

// --- Revert ---

export interface RevertRequestPreview {
  method: "PATCH";
  path: string;
  body: { op: string; path: string; value: unknown }[];
}

export interface RevertExcluded {
  field: string;
  reason: string;
}

export type RevertResult =
  | { kind: "blocked"; blockedReason: string; excluded: RevertExcluded[] }
  | { kind: "conflict"; message: string; driftedFields: string[] }
  | { kind: "preview"; request: RevertRequestPreview; excluded: RevertExcluded[] }
  | { kind: "applied"; request: RevertRequestPreview; excluded: RevertExcluded[]; result: unknown }
  | { kind: "error"; message: string };

export interface RevertInput {
  runId: string;
  objectType: ObjectType;
  objectId: string;
  clientId: string;
  clientSecret: string;
  dryRun: boolean;
}

/**
 * Deliberately doesn't go through handle() — a 409 conflict and a 200
 * "blocked" response both carry structured detail (drifted fields,
 * exclusion reasons) the UI needs to show, not just a flat error string.
 * Credentials here are used only for this one request, same as triggerRun.
 * baseUrl is no longer part of the input — derived server-side, same
 * reasoning as triggerRun.
 */
export async function revertChange(input: RevertInput): Promise<RevertResult> {
  const res = await fetch("/api/revert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => ({}));

  if (res.status === 409) {
    return { kind: "conflict", message: body.message ?? "Conflict detected", driftedFields: body.driftedFields ?? [] };
  }
  if (!res.ok) {
    return { kind: "error", message: body.error ?? `Request failed (${res.status})` };
  }
  if (body.revertible === false) {
    return { kind: "blocked", blockedReason: body.blockedReason ?? "Not revertible", excluded: body.excluded ?? [] };
  }
  if (body.applied) {
    return { kind: "applied", request: body.request, excluded: body.excluded ?? [], result: body.result };
  }
  return { kind: "preview", request: body.request, excluded: body.excluded ?? [] };
}
