import { Router } from "express";
import { getAccessToken } from "../engine/auth.js";
import { fetchOne, patchOne } from "../engine/iscClient.js";
import { RESOURCE_BASE_PATH } from "../engine/collectors/registry.js";
import { getSnapshotAt } from "../engine/snapshotStore.js";
import { getRun, recordRevert } from "../engine/runStore.js";
import { buildRevertPlan, findDrift } from "../engine/revert/buildRevertPlan.js";
import type { ObjectType, TenantConnection } from "../engine/types.js";

export const revertRouter = Router();

interface RevertBody {
  runId: string;
  objectType: ObjectType;
  objectId: string;
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  dryRun: boolean;
}

/**
 * Preview or apply a revert for one "modified" change. Mounted behind
 * requireRole('admin') in app.ts — this is the one endpoint in the app that
 * writes to a live tenant, everything else only reads.
 *
 * Body identifies the change by (runId, objectType, objectId) rather than
 * accepting field values directly from the client — the server re-derives
 * the actual before/after state from its own stored run + snapshot data,
 * so a client can't submit arbitrary values to patch that don't match what
 * was genuinely detected.
 */
revertRouter.post("/", async (req, res) => {
  const body = req.body as Partial<RevertBody>;

  if (!body.runId || !body.objectType || !body.objectId) {
    return res.status(400).json({ error: "runId, objectType, and objectId are required" });
  }
  if (!body.baseUrl || !body.clientId || !body.clientSecret) {
    return res.status(400).json({ error: "baseUrl, clientId, and clientSecret are required" });
  }

  const run = await getRun(body.runId);
  if (!run) return res.status(404).json({ error: "Run not found" });

  const report = run.reports.find((r) => r.objectType === body.objectType);
  if (!report) return res.status(404).json({ error: `No ${body.objectType} report in this run` });

  const change = report.changes.find((c) => c.id === body.objectId);
  if (!change) return res.status(404).json({ error: "No such change in this run" });

  if (change.changeType !== "modified") {
    return res.status(400).json({ error: "Only modified changes support revert currently." });
  }
  if (body.objectType === "identities") {
    return res.status(400).json({ error: "Identities cannot be reverted." });
  }
  if (!report.baselineSnapshotAt) {
    return res.status(400).json({ error: "No baseline snapshot to revert to (this was the first run)." });
  }

  const beforeSnapshot = await getSnapshotAt(run.tenant, body.objectType, report.baselineSnapshotAt);
  const afterSnapshot = await getSnapshotAt(run.tenant, body.objectType, report.currentSnapshotAt);
  const beforeObj = beforeSnapshot?.objects.find((o) => o.id === body.objectId);
  const afterObj = afterSnapshot?.objects.find((o) => o.id === body.objectId);

  if (!beforeObj || !afterObj) {
    return res.status(404).json({ error: "Snapshot data for this object is no longer available." });
  }

  const plan = buildRevertPlan(body.objectType, beforeObj, afterObj);
  if (!plan.revertible) {
    return res.json({ revertible: false, blockedReason: plan.blockedReason, excluded: plan.excluded });
  }

  const conn: TenantConnection = {
    baseUrl: body.baseUrl.replace(/\/$/, ""),
    clientId: body.clientId,
    clientSecret: body.clientSecret,
  };
  const basePath = RESOURCE_BASE_PATH[body.objectType];

  try {
    const token = await getAccessToken(conn);

    // Live conflict check — never skip this, dry run or not. If the object
    // has drifted from what we detected, abort rather than risk stomping on
    // a change made after our snapshot.
    const live = await fetchOne(conn, token, basePath, body.objectId);
    const drift = findDrift(body.objectType, afterObj, live);
    if (drift.length > 0) {
      return res.status(409).json({
        conflict: true,
        message: "This object has changed since it was detected — revert aborted to avoid overwriting a newer change.",
        driftedFields: drift,
      });
    }

    const request = { method: "PATCH", path: `${basePath}/${body.objectId}`, body: plan.patch };

    if (body.dryRun) {
      return res.json({ revertible: true, applied: false, request, excluded: plan.excluded });
    }

    const result = await patchOne(conn, token, basePath, body.objectId, plan.patch);

    await recordRevert(body.runId, {
      objectType: body.objectType,
      objectId: body.objectId,
      appliedBy: (req as typeof req & { auth?: { user: string } }).auth?.user,
      fieldsReverted: plan.patch.map((p) => p.path.slice(1)),
      excludedFields: plan.excluded.map((e) => e.field),
    });

    res.json({ revertible: true, applied: true, request, excluded: plan.excluded, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Revert failed";
    res.status(502).json({ error: message });
  }
});
