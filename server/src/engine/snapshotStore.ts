import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ObjectType, Snapshot } from "./types.js";

/**
 * File-based snapshot store, keyed by tenant/objectType/timestamp.
 *
 * This is intentionally the simplest thing that works, so the pipeline
 * is runnable without standing up infrastructure. For production,
 * replace this module with a Postgres-backed implementation:
 *   snapshots(tenant, object_type, taken_at, object_id, payload jsonb, content_hash)
 * keeping the same saveSnapshot/getLatestTwo function signatures so
 * nothing upstream (collectors, diff engine) needs to change.
 */

const STORE_ROOT = path.resolve(process.env.DATA_DIR ?? process.cwd(), "snapshots");
// DATA_DIR lets a persistent volume (e.g. on Railway) live in a directory
// separate from the app's own code — mounting a volume directly over the
// code directory would hide the built files underneath it. Unset locally,
// this falls back to the previous cwd-relative behavior unchanged.

function dirFor(tenant: string, objectType: ObjectType): string {
  // Tenant name only — never any credential material — touches disk here.
  return path.join(STORE_ROOT, sanitize(tenant), objectType);
}

function sanitize(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function saveSnapshot(snapshot: Snapshot): Promise<void> {
  const dir = dirFor(snapshot.tenant, snapshot.objectType);
  await mkdir(dir, { recursive: true });
  const filename = `${snapshot.takenAt.replace(/[:.]/g, "-")}.json`;
  await writeFile(path.join(dir, filename), JSON.stringify(snapshot, null, 2), "utf-8");
}

async function loadSnapshot(dir: string, file: string): Promise<Snapshot> {
  return JSON.parse(await readFile(path.join(dir, file), "utf-8")) as Snapshot;
}

/**
 * Returns the current (latest) snapshot and a baseline to diff it against.
 *
 * - lookbackDays omitted → baseline is the immediately-prior snapshot
 *   (original behavior).
 * - lookbackDays given → baseline is the most recent snapshot at or before
 *   (current.takenAt - lookbackDays). If no snapshot is that old yet, falls
 *   back to the earliest snapshot available, and the caller should treat
 *   the report's actual baseline timestamp as authoritative — it may cover
 *   less history than requested.
 *
 * baseline is null only when this is the first-ever snapshot for this
 * tenant/objectType (nothing to compare against).
 */
export async function getBaselineAndCurrent(
  tenant: string,
  objectType: ObjectType,
  lookbackDays?: number
): Promise<{ current: Snapshot; baseline: Snapshot | null }> {
  const dir = dirFor(tenant, objectType);
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    throw new Error(`No snapshots found for ${tenant}/${objectType} yet`);
  }

  const jsonFiles = files.filter((f) => f.endsWith(".json"));
  if (jsonFiles.length === 0) {
    throw new Error(`No snapshots found for ${tenant}/${objectType} yet`);
  }

  const all = await Promise.all(jsonFiles.map((f) => loadSnapshot(dir, f)));
  all.sort((a, b) => a.takenAt.localeCompare(b.takenAt)); // ascending, oldest first

  const current = all[all.length - 1];
  const history = all.slice(0, -1);

  if (history.length === 0) {
    return { current, baseline: null };
  }

  if (lookbackDays == null) {
    return { current, baseline: history[history.length - 1] };
  }

  const cutoff = new Date(current.takenAt).getTime() - lookbackDays * 24 * 60 * 60 * 1000;
  const eligible = history.filter((s) => new Date(s.takenAt).getTime() <= cutoff);
  const baseline = eligible.length > 0 ? eligible[eligible.length - 1] : history[0];

  return { current, baseline };
}

/**
 * Loads the exact snapshot taken at a specific timestamp — used by revert
 * to get the precise "before"/"after" full object bodies a given run's
 * DiffReport was computed from (report.baselineSnapshotAt / .currentSnapshotAt),
 * as opposed to getBaselineAndCurrent's "whatever's current/prior right now"
 * semantics. Returns null if no snapshot with that exact timestamp exists
 * (e.g. very old data pruned, or a mismatched timestamp).
 */
export async function getSnapshotAt(
  tenant: string,
  objectType: ObjectType,
  takenAt: string
): Promise<Snapshot | null> {
  const dir = dirFor(tenant, objectType);
  const filename = `${takenAt.replace(/[:.]/g, "-")}.json`;
  try {
    return await loadSnapshot(dir, filename);
  } catch {
    return null;
  }
}
