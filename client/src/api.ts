import type { ObjectType, RunReport, RunSummary } from "./types";

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export interface TriggerRunInput {
  baseUrl: string;
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
 * state after the request resolves.
 */
export async function triggerRun(input: TriggerRunInput): Promise<RunReport> {
  const res = await fetch("/api/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return handle<RunReport>(res);
}

export async function listRuns(tenant?: string): Promise<RunSummary[]> {
  const qs = tenant ? `?tenant=${encodeURIComponent(tenant)}` : "";
  const res = await fetch(`/api/runs${qs}`);
  return handle<RunSummary[]>(res);
}

export async function getRun(id: string): Promise<RunReport> {
  const res = await fetch(`/api/runs/${id}`);
  return handle<RunReport>(res);
}

export async function listTenants(): Promise<string[]> {
  const res = await fetch("/api/runs/tenants");
  return handle<string[]>(res);
}

export async function renameRun(id: string, name: string): Promise<RunReport> {
  const res = await fetch(`/api/runs/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return handle<RunReport>(res);
}

/** DELETE returns 204 No Content on success — no body to parse, unlike
 *  every other endpoint here, so this doesn't go through handle(). */
export async function deleteRun(id: string): Promise<void> {
  const res = await fetch(`/api/runs/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
}

export async function deleteTenant(tenant: string): Promise<{ deletedRunCount: number }> {
  const res = await fetch(`/api/runs/tenants/${encodeURIComponent(tenant)}`, { method: "DELETE" });
  return handle<{ deletedRunCount: number }>(res);
}

export interface WhoAmI {
  username?: string;
  role?: "admin" | "read-only";
}

export async function getWhoAmI(): Promise<WhoAmI> {
  const res = await fetch("/api/whoami");
  return handle<WhoAmI>(res);
}

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
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  dryRun: boolean;
}

/**
 * Deliberately doesn't go through handle() — a 409 conflict and a 200
 * "blocked" response both carry structured detail (drifted fields,
 * exclusion reasons) the UI needs to show, not just a flat error string.
 * Credentials here are used only for this one request, same as triggerRun.
 */
export async function revertChange(input: RevertInput): Promise<RevertResult> {
  const res = await fetch("/api/revert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
