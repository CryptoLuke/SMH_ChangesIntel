import { getAccessToken } from "./engine/auth.js";
import { collectObjectType, DEFAULT_SCOPE } from "./engine/collectors/registry.js";
import { saveSnapshot, getBaselineAndCurrent } from "./engine/snapshotStore.js";
import { diffObjectType } from "./engine/diffEngine.js";
import { saveRun } from "./engine/runStore.js";
import type { DiffReport, ObjectType, Snapshot, TenantConnection } from "./engine/types.js";

/**
 * Credentials are read from the environment at run start and used only
 * to obtain a bearer token — they are never written to the snapshot
 * store, never logged, and go out of scope once this process exits.
 *
 * For a scheduled job, replace this env-var read with a call to your
 * secrets manager (see README "Credential handling" section) — the
 * rest of the pipeline is unaffected either way.
 */
function loadConnectionFromEnv(): TenantConnection {
  const baseUrl = process.env.ISC_BASE_URL;
  const clientId = process.env.ISC_CLIENT_ID;
  const clientSecret = process.env.ISC_CLIENT_SECRET;

  if (!baseUrl || !clientId || !clientSecret) {
    throw new Error(
      "Set ISC_BASE_URL, ISC_CLIENT_ID, and ISC_CLIENT_SECRET before running."
    );
  }
  return { baseUrl: baseUrl.replace(/\/$/, ""), clientId, clientSecret };
}

async function run() {
  const conn = loadConnectionFromEnv();
  const tenant = new URL(conn.baseUrl).hostname.split(".")[0];
  const scope: ObjectType[] =
    (process.env.ISC_SCOPE?.split(",") as ObjectType[]) ?? DEFAULT_SCOPE;

  // Days to trace back for the comparison baseline. Unset = compare against
  // whatever the immediately-prior snapshot was (original behavior).
  const lookbackRaw = process.env.ISC_LOOKBACK_DAYS;
  const lookbackDays = lookbackRaw != null ? Number(lookbackRaw) : undefined;
  if (lookbackRaw != null && (!Number.isFinite(lookbackDays) || lookbackDays! <= 0)) {
    throw new Error(`ISC_LOOKBACK_DAYS must be a positive number, got "${lookbackRaw}"`);
  }

  console.log(`Authenticating against ${conn.baseUrl}...`);
  const token = await getAccessToken(conn);
  const startedAt = new Date().toISOString();
  const reports: DiffReport[] = [];

  for (const objectType of scope) {
    console.log(`Collecting ${objectType}...`);
    const objects = await collectObjectType(conn, token, objectType);

    const snapshot: Snapshot = {
      tenant,
      objectType,
      takenAt: new Date().toISOString(),
      objects,
    };
    await saveSnapshot(snapshot);

    const report: DiffReport = {
      tenant,
      objectType,
      comparedAt: new Date().toISOString(),
      lookbackDays: lookbackDays ?? null,
      baselineSnapshotAt: null,
      currentSnapshotAt: snapshot.takenAt,
      changes: [],
    };

    try {
      const { current, baseline } = await getBaselineAndCurrent(tenant, objectType, lookbackDays);
      report.changes = diffObjectType(objectType, baseline, current);
      if (baseline) {
        report.baselineSnapshotAt = baseline.takenAt;
        if (lookbackDays != null) {
          const actualGapMs = new Date(current.takenAt).getTime() - new Date(baseline.takenAt).getTime();
          const actualGapDays = actualGapMs / (24 * 60 * 60 * 1000);
          if (actualGapDays < lookbackDays - 0.01) {
            console.log(
              `  Note: requested ${lookbackDays}d lookback for ${objectType}, but only ${actualGapDays.toFixed(1)}d of history exists — using earliest available snapshot.`
            );
          }
        }
      }
    } catch {
      console.log(`  First run for ${objectType} — nothing to compare yet.`);
    }

    reports.push(report);
  }

  const savedRun = await saveRun({
    tenant,
    baseUrl: conn.baseUrl,
    startedAt,
    lookbackDays: lookbackDays ?? null,
    scope,
    reports,
    name: process.env.ISC_RUN_NAME?.trim() || undefined,
    triggeredBy: process.env.ISC_TRIGGERED_BY?.trim() || undefined,
  });
  console.log(`\nRun saved (id: ${savedRun.id}) — also visible in the dashboard if the API server is running.\n`);
  console.log(JSON.stringify(savedRun, null, 2));
}

run().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
