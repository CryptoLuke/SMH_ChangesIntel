import { mkdir, readdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { RunReport } from "./types.js";

/**
 * Stores completed RunReports (one per triggered collection+diff run) so the
 * dashboard can list run history and open any past run. File-based, same
 * rationale as snapshotStore.ts — swap for Postgres alongside it later.
 */

const RUNS_ROOT = path.resolve(process.env.DATA_DIR ?? process.cwd(), "runs");

function sanitize(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function saveRun(run: Omit<RunReport, "id">): Promise<RunReport> {
  await mkdir(RUNS_ROOT, { recursive: true });
  const id = randomUUID();
  const full: RunReport = { id, ...run };
  const filename = `${sanitize(run.tenant)}__${run.startedAt.replace(/[:.]/g, "-")}__${id}.json`;
  await writeFile(path.join(RUNS_ROOT, filename), JSON.stringify(full, null, 2), "utf-8");
  return full;
}

export interface RunSummary {
  id: string;
  tenant: string;
  startedAt: string;
  scope: RunReport["scope"];
  totalChanges: number;
  name?: string;
  triggeredBy?: string;
}

export async function listRuns(tenant?: string): Promise<RunSummary[]> {
  let files: string[];
  try {
    files = await readdir(RUNS_ROOT);
  } catch {
    return [];
  }

  const runs = await Promise.all(
    files
      .filter((f) => f.endsWith(".json"))
      .map(async (f) => JSON.parse(await readFile(path.join(RUNS_ROOT, f), "utf-8")) as RunReport)
  );

  return runs
    .filter((r) => !tenant || r.tenant === tenant)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .map((r) => ({
      id: r.id,
      tenant: r.tenant,
      startedAt: r.startedAt,
      scope: r.scope,
      totalChanges: r.reports.reduce((sum, rep) => sum + rep.changes.length, 0),
      name: r.name,
      triggeredBy: r.triggeredBy,
    }));
}

export async function getRun(id: string): Promise<RunReport | null> {
  let files: string[];
  try {
    files = await readdir(RUNS_ROOT);
  } catch {
    return null;
  }
  const match = files.find((f) => f.includes(id));
  if (!match) return null;
  return JSON.parse(await readFile(path.join(RUNS_ROOT, match), "utf-8")) as RunReport;
}

/**
 * Updates a run's display name in place. The file's name itself (tenant +
 * timestamp + id) never changes — only the `name` field inside it — so
 * this is a read-modify-write against the same file, not a rename on disk.
 */
export async function renameRun(id: string, name: string): Promise<RunReport | null> {
  let files: string[];
  try {
    files = await readdir(RUNS_ROOT);
  } catch {
    return null;
  }
  const match = files.find((f) => f.includes(id));
  if (!match) return null;

  const filePath = path.join(RUNS_ROOT, match);
  const run = JSON.parse(await readFile(filePath, "utf-8")) as RunReport;
  const updated: RunReport = { ...run, name: name.trim() || undefined };
  await writeFile(filePath, JSON.stringify(updated, null, 2), "utf-8");
  return updated;
}

export async function listTenants(): Promise<string[]> {
  let files: string[];
  try {
    files = await readdir(RUNS_ROOT);
  } catch {
    return [];
  }
  const tenants = new Set(
    (
      await Promise.all(
        files
          .filter((f) => f.endsWith(".json"))
          .map(async (f) => (JSON.parse(await readFile(path.join(RUNS_ROOT, f), "utf-8")) as RunReport).tenant)
      )
    )
  );
  return [...tenants].sort();
}

/** Appends one audit entry to a run's revert history. Read-modify-write
 *  against the same file, same pattern as renameRun. */
export async function recordRevert(
  runId: string,
  record: Omit<import("./types.js").RevertRecord, "appliedAt">
): Promise<RunReport | null> {
  let files: string[];
  try {
    files = await readdir(RUNS_ROOT);
  } catch {
    return null;
  }
  const match = files.find((f) => f.includes(runId));
  if (!match) return null;

  const filePath = path.join(RUNS_ROOT, match);
  const run = JSON.parse(await readFile(filePath, "utf-8")) as RunReport;
  const entry = { ...record, appliedAt: new Date().toISOString() };
  const updated: RunReport = { ...run, reverts: [...(run.reverts ?? []), entry] };
  await writeFile(filePath, JSON.stringify(updated, null, 2), "utf-8");
  return updated;
}

/** Deletes a single run's history entry. Does NOT touch snapshot data —
 *  snapshots are shared across consecutive runs (today's "current" becomes
 *  tomorrow's "baseline"), so removing one run's diff-report shouldn't
 *  break diffing/revert for other runs that reference the same snapshots. */
export async function deleteRun(id: string): Promise<boolean> {
  let files: string[];
  try {
    files = await readdir(RUNS_ROOT);
  } catch {
    return false;
  }
  const match = files.find((f) => f.includes(id));
  if (!match) return false;
  await unlink(path.join(RUNS_ROOT, match));
  return true;
}

/** Deletes every run entry for a tenant. Pairs with
 *  snapshotStore.deleteAllSnapshotsForTenant for a full "forget this
 *  tenant" action — unlike single-run deletion, wiping snapshots here is
 *  safe because nothing else should still need them once the tenant itself
 *  is being removed. Returns the number of runs deleted. */
export async function deleteRunsForTenant(tenant: string): Promise<number> {
  let files: string[];
  try {
    files = await readdir(RUNS_ROOT);
  } catch {
    return 0;
  }
  const runs = await Promise.all(
    files
      .filter((f) => f.endsWith(".json"))
      .map(async (f) => ({ file: f, run: JSON.parse(await readFile(path.join(RUNS_ROOT, f), "utf-8")) as RunReport }))
  );
  const toDelete = runs.filter((r) => r.run.tenant === tenant);
  await Promise.all(toDelete.map((r) => unlink(path.join(RUNS_ROOT, r.file))));
  return toDelete.length;
}
