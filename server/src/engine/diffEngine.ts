import { createHash } from "node:crypto";
import type { ChangeRecord, FieldDiff, ObjectType, RawObject, Snapshot } from "./types.js";

/**
 * Top-level fields to exclude entirely from change detection for specific
 * object types — both from triggering a "modified" verdict and from the
 * field-diff list. Scoped narrowly and documented per entry; this is not a
 * general noise filter.
 */
export const IGNORED_TOP_LEVEL_FIELDS: Partial<Record<ObjectType, Set<string>>> = {
  // lastRefresh and modified are sync/audit timestamps that update on every
  // identity refresh cycle by definition (they record *when* the refresh
  // happened), independent of whether any real attribute changed. Comparing
  // them produces "modified" noise on essentially every run.
  identities: new Set(["lastRefresh", "modified"]),
  // Same idea for sources: `modified` bumps on every health-check cycle,
  // observed directly in a live tenant (a source with zero real config
  // change still showed a changed `modified` timestamp every run).
  sources: new Set(["modified"]),
  // `synced` is an entitlement-aggregation timestamp that bumps every sync
  // cycle regardless of whether the entitlement itself changed — observed
  // directly in a live tenant (thousands of entitlements flagged "modified"
  // on a run where only `synced` differed, nothing else).
  entitlements: new Set(["synced"]),
};

/**
 * Nested keys stripped at any depth before diffing, scoped per object type.
 * "triggerSnapshots" was observed directly in a live tenant's identity
 * `attributes` payload — not documented — as SailPoint's own bookkeeping
 * when an attribute-change trigger fires: it embeds a copy of the *prior*
 * attribute values inside the *new* snapshot, producing a nonsensical diff
 * entry if left in.
 *
 * "slpt-source-diagnostics" (under a source's `connectorAttributes`) is a
 * live connector health-check payload — healthcheckCount, a lastHealthcheck
 * epoch, status — that updates on every health-check cycle regardless of
 * whether the source's actual configuration changed. Also observed
 * directly in a live tenant, not documented.
 *
 * "since" and "cloudCacheUpdate" (both under a source's `connectorAttributes`,
 * and "since" also appears at the source's top level) are cache/sync
 * bookkeeping timestamps — observed directly in a live tenant changing on
 * every run with no other real difference. Matching by key name at any
 * depth catches both the nested and top-level occurrences of "since" with
 * one entry.
 */
const IGNORED_NESTED_KEYS: Partial<Record<ObjectType, Set<string>>> = {
  identities: new Set(["triggerSnapshots"]),
  sources: new Set(["slpt-source-diagnostics", "since", "cloudCacheUpdate"]),
};

function stripTopLevel(obj: RawObject, ignore: Set<string>): RawObject {
  if (ignore.size === 0) return obj;
  const out: RawObject = { id: obj.id };
  for (const key of Object.keys(obj)) {
    if (!ignore.has(key)) out[key] = obj[key];
  }
  return out;
}

function hashObject(obj: RawObject): string {
  return createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}

/** Prefers a human-readable display name when the object has one (identities
 *  usually carry both `name`, often a username, and `displayName`, a full
 *  name). When both are present and differ, the username is kept as
 *  secondaryName so duplicate display names stay distinguishable. */
function nameFields(obj: RawObject): { name?: string; secondaryName?: string } {
  const dn = obj.displayName;
  const rawName = obj.name;
  if (typeof dn === "string" && dn && typeof rawName === "string" && rawName && dn !== rawName) {
    return { name: dn, secondaryName: rawName };
  }
  return { name: (typeof dn === "string" && dn) || rawName };
}

/**
 * Recursively walks a value, writing every leaf (non-object, non-array,
 * non-null) into `out` keyed by its dotted path (e.g. "attributes.endDate").
 * Arrays are treated as leaves — diffed as a whole rather than element by
 * element, since ordering/identity within an array isn't well-defined here.
 * This is what turns "the whole `attributes` blob changed" into individual
 * field-level diffs, and makes comparison order-independent (key order
 * inside a nested object no longer matters).
 */
function flatten(
  value: unknown,
  prefix: string,
  out: Record<string, unknown>,
  ignoreNested: Set<string>
): void {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      if (ignoreNested.has(key)) continue;
      const path = prefix ? `${prefix}.${key}` : key;
      flatten((value as Record<string, unknown>)[key], path, out, ignoreNested);
    }
  } else {
    out[prefix] = value;
  }
}

/**
 * Comparison signature for a leaf value. Arrays get their elements sorted
 * by serialized form before comparing — SailPoint doesn't guarantee stable
 * ordering for reference-list fields (e.g. a role's dimensionRefs), so a
 * pure reorder of the same elements would otherwise look like a change.
 * This only affects equality checking; the raw value is still what's shown
 * in the diff if a real difference is found.
 */
function leafSignature(value: unknown): string {
  if (Array.isArray(value)) {
    return JSON.stringify([...value].map((v) => JSON.stringify(v)).sort());
  }
  return JSON.stringify(value);
}

function fieldDiffs(before: RawObject, after: RawObject, ignoreNested: Set<string>): FieldDiff[] {
  const beforeFlat: Record<string, unknown> = {};
  const afterFlat: Record<string, unknown> = {};
  flatten(before, "", beforeFlat, ignoreNested);
  flatten(after, "", afterFlat, ignoreNested);
  delete beforeFlat[""];
  delete afterFlat[""];

  const keys = new Set([...Object.keys(beforeFlat), ...Object.keys(afterFlat)]);
  const diffs: FieldDiff[] = [];
  for (const key of keys) {
    const b = beforeFlat[key];
    const a = afterFlat[key];
    if (leafSignature(b) !== leafSignature(a)) {
      diffs.push({ field: key, before: b, after: a });
    }
  }
  return diffs.sort((x, y) => x.field.localeCompare(y.field));
}

export function diffObjectType(
  objectType: ObjectType,
  previous: Snapshot | null,
  current: Snapshot
): ChangeRecord[] {
  const ignoreTop = IGNORED_TOP_LEVEL_FIELDS[objectType] ?? new Set<string>();
  const ignoreNested = IGNORED_NESTED_KEYS[objectType] ?? new Set<string>();
  const changes: ChangeRecord[] = [];
  const prevById = new Map(
    (previous?.objects ?? []).map((o) => [o.id, stripTopLevel(o, ignoreTop)])
  );
  const currById = new Map(current.objects.map((o) => [o.id, stripTopLevel(o, ignoreTop)]));

  for (const [id, obj] of currById) {
    const prevObj = prevById.get(id);
    if (!prevObj) {
      changes.push({ objectType, id, ...nameFields(obj), changeType: "added" });
      continue;
    }
    if (hashObject(prevObj) !== hashObject(obj)) {
      const diffs = fieldDiffs(prevObj, obj, ignoreNested);
      if (diffs.length === 0) continue; // only ignored fields changed — not a real modification
      changes.push({
        objectType,
        id,
        ...nameFields(obj),
        changeType: "modified",
        changedFields: diffs,
      });
    }
  }

  for (const [id, obj] of prevById) {
    if (!currById.has(id)) {
      changes.push({ objectType, id, ...nameFields(obj), changeType: "removed" });
    }
  }

  return changes;
}
