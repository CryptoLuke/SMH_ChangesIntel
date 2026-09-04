import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { RunReport } from "./types.js";

/**
 * Stores completed RunReports (one per triggered collection+diff run) so the
 * dashboard can list run history and open any past run. File-based, same
 * rationale as snapshotStore.ts — swap for Postgres alongside it later.
 */

const RUNS_ROOT = path.resolve(process.cwd(), "runs");

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
