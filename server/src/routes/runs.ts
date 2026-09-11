import { Router } from "express";
import { getAccessToken } from "../engine/auth.js";
import { collectObjectType } from "../engine/collectors/registry.js";
import { saveSnapshot, getBaselineAndCurrent } from "../engine/snapshotStore.js";
import { diffObjectType } from "../engine/diffEngine.js";
import { saveRun, listRuns, getRun, renameRun, deleteRun } from "../engine/runStore.js";
import { getWorkspace } from "../auth/workspaceStore.js";
import { requireRole } from "../auth/requireRole.js";
import "../auth/session.js";
import type { DiffReport, ObjectType, Snapshot, TenantConnection } from "../engine/types.js";

export const runsRouter = Router();

interface TriggerRunBody {
  clientId: string;
  clientSecret: string;
  scope: ObjectType[];
  lookbackDays?: number;
  name?: string;
}

/**
 * Triggers a new collection + diff run against the caller's own workspace.
 * Unlike before, baseUrl is NOT accepted from the request — it comes from
 * the registered workspace record for the logged-in session, so there's no
 * way to point a run at a different tenant than the one you're logged into.
 * clientId/clientSecret still arrive fresh per request and are never stored.
 */
runsRouter.post("/", async (req, res) => {
  const body = req.body as Partial<TriggerRunBody>;
  const { orgName, username } = req.session.user!;

  if (!body.clientId || !body.clientSecret) {
    return res.status(400).json({ error: "clientId and clientSecret are required" });
  }
  if (!body.scope || body.scope.length === 0) {
    return res.status(400).json({ error: "scope must include at least one object type" });
  }

  const workspace = await getWorkspace(orgName);
  if (!workspace) return res.status(404).json({ error: "Workspace not found" });

  const conn: TenantConnection = { baseUrl: workspace.baseUrl, clientId: body.clientId, clientSecret: body.clientSecret };
  const tenant = orgName;
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
      name: body.name?.trim() || undefined,
      triggeredBy: username,
    });
    res.status(201).json(run);
  } catch (err) {
    // Never echo request body (contains the secret) back in an error.
    const message = err instanceof Error ? err.message : "Run failed";
    res.status(502).json({ error: message });
  }
});

/** Always scoped to the caller's own workspace — there's no way to list
 *  another workspace's runs, by design. */
runsRouter.get("/", async (req, res) => {
  res.json(await listRuns(req.session.user!.orgName));
});

/** Ownership check: a run belonging to a different workspace 404s rather
 *  than 403s, so as not to confirm that a given run id exists elsewhere. */
runsRouter.get("/:id", async (req, res) => {
  const run = await getRun(req.params.id);
  if (!run || run.tenant !== req.session.user!.orgName) {
    return res.status(404).json({ error: "Run not found" });
  }
  res.json(run);
});

runsRouter.patch("/:id", async (req, res) => {
  const name = (req.body as { name?: unknown }).name;
  if (typeof name !== "string") {
    return res.status(400).json({ error: "name (string) is required" });
  }
  const run = await getRun(req.params.id);
  if (!run || run.tenant !== req.session.user!.orgName) {
    return res.status(404).json({ error: "Run not found" });
  }
  const updated = await renameRun(req.params.id, name);
  res.json(updated);
});

/**
 * Deletes a single run's history entry. Admin-only. Snapshot data is left
 * untouched — see the comment on runStore.deleteRun for why (snapshots are
 * shared across consecutive runs, deleting one run's diff-report shouldn't
 * break diffing/revert for others that reference the same snapshot data).
 */
runsRouter.delete("/:id", requireRole("admin"), async (req, res) => {
  const run = await getRun(req.params.id);
  if (!run || run.tenant !== req.session.user!.orgName) {
    return res.status(404).json({ error: "Run not found" });
  }
  await deleteRun(req.params.id);
  res.status(204).end();
});
