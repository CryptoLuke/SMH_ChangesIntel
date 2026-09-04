import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
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
const STORE_ROOT = path.resolve(process.cwd(), "snapshots");
function dirFor(tenant, objectType) {
    // Tenant name only — never any credential material — touches disk here.
    return path.join(STORE_ROOT, sanitize(tenant), objectType);
}
function sanitize(segment) {
    return segment.replace(/[^a-zA-Z0-9._-]/g, "_");
}
export async function saveSnapshot(snapshot) {
    const dir = dirFor(snapshot.tenant, snapshot.objectType);
    await mkdir(dir, { recursive: true });
    const filename = `${snapshot.takenAt.replace(/[:.]/g, "-")}.json`;
    await writeFile(path.join(dir, filename), JSON.stringify(snapshot, null, 2), "utf-8");
}
async function loadSnapshot(dir, file) {
    return JSON.parse(await readFile(path.join(dir, file), "utf-8"));
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
export async function getBaselineAndCurrent(tenant, objectType, lookbackDays) {
    const dir = dirFor(tenant, objectType);
    let files;
    try {
        files = await readdir(dir);
    }
    catch {
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
