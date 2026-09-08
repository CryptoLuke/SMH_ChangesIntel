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
