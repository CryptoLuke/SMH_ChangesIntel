import { Router } from "express";
import { getAccessToken } from "../engine/auth.js";
import { collectObjectType } from "../engine/collectors/registry.js";
import { saveSnapshot, getBaselineAndCurrent } from "../engine/snapshotStore.js";
import { diffObjectType } from "../engine/diffEngine.js";
import { saveRun, listRuns, getRun, listTenants } from "../engine/runStore.js";
import type { DiffReport, ObjectType, Snapshot, TenantConnection } from "../engine/types.js";

export const runsRouter = Router();

interface TriggerRunBody {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  scope: ObjectType[];
  lookbackDays?: number;
}

/**
 * Triggers a new collection + diff run.
 *
 * baseUrl/clientId/clientSecret arrive in the request body, are used only
 * to obtain a bearer token for this request's lifetime, and are never
 * written to disk, logged, or included in the response or the saved
 * RunReport. Nothing here persists them beyond this handler returning.
 */
runsRouter.post("/", async (req, res) => {
  const body = req.body as Partial<TriggerRunBody>;

  if (!body.baseUrl || !body.clientId || !body.clientSecret) {
    return res.status(400).json({ error: "baseUrl, clientId, and clientSecret are required" });
  }
  if (!body.scope || body.scope.length === 0) {
    return res.status(400).json({ error: "scope must include at least one object type" });
  }

  const conn: TenantConnection = {
    baseUrl: body.baseUrl.replace(/\/$/, ""),
    clientId: body.clientId,
    clientSecret: body.clientSecret,
  };
  const tenant = new URL(conn.baseUrl).hostname.split(".")[0];
  const lookbackDays = body.lookbackDays;

  try {
    const token = await getAccessToken(conn);
    const startedAt = new Date().toISOString();
    const reports: DiffReport[] = [];

    for (const objectType of body.scope) {
      const objects = await collectObjectType(conn, token, objectType);
      const snapshot: Snapshot = { tenant, objectType, takenAt: new Date().toISOString(), objects };
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
        if (baseline) report.baselineSnapshotAt = baseline.takenAt;
      } catch {
        // First run for this object type — nothing to compare yet, report stays empty.
      }

      reports.push(report);
    }

    const run = await saveRun({
      tenant,
      baseUrl: conn.baseUrl,
      startedAt,
      lookbackDays: lookbackDays ?? null,
      scope: body.scope,
      reports,
    });
    res.status(201).json(run);
  } catch (err) {
    // Never echo request body (contains the secret) back in an error.
    const message = err instanceof Error ? err.message : "Run failed";
    res.status(502).json({ error: message });
  }
});

runsRouter.get("/", async (req, res) => {
  const tenant = typeof req.query.tenant === "string" ? req.query.tenant : undefined;
  res.json(await listRuns(tenant));
});

runsRouter.get("/tenants", async (_req, res) => {
  res.json(await listTenants());
});

runsRouter.get("/:id", async (req, res) => {
  const run = await getRun(req.params.id);
  if (!run) return res.status(404).json({ error: "Run not found" });
  res.json(run);
});
