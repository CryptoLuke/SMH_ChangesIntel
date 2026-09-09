import type { JsonPatchOp } from "../iscClient.js";
import type { ObjectType, RawObject } from "../types.js";
import { IGNORED_TOP_LEVEL_FIELDS } from "../diffEngine.js";
import { checkFieldPatchable, supportsRevert } from "./patchableFields.js";

export interface ExcludedField {
  field: string;
  reason: string;
}

export interface RevertPlan {
  revertible: boolean;
  /** Why revertible is false, when it is. */
  blockedReason?: string;
  patch: JsonPatchOp[];
  excluded: ExcludedField[];
}

/** Converts a top-level field name to an RFC6902 JSON Pointer, escaping
 *  the two characters JSON Pointer treats specially. */
function toJsonPointer(field: string): string {
  return "/" + field.replace(/~/g, "~0").replace(/\//g, "~1");
}

/**
 * Compares the full "before" and "after" objects at top-level-field
 * granularity (not the deep flattened paths the diff view uses — see the
 * module comment in patchableFields.ts for why: a real working patch-role
 * example replaces an entire nested object like `owner` in one operation,
 * not a deep sub-path within it). For each top-level field that actually
 * differs, decides whether it's patchable and either adds a whole-field
 * "replace back to the prior value" operation, or records why it can't.
 */
export function buildRevertPlan(objectType: ObjectType, before: RawObject, after: RawObject): RevertPlan {
  if (!supportsRevert(objectType)) {
    return { revertible: false, blockedReason: `${objectType} does not support revert.`, patch: [], excluded: [] };
  }

  const ignoreTop = IGNORED_TOP_LEVEL_FIELDS[objectType] ?? new Set<string>();
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const patch: JsonPatchOp[] = [];
  const excluded: ExcludedField[] = [];

  for (const key of keys) {
    if (key === "id" || ignoreTop.has(key)) continue;
    if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue; // unchanged

    const check = checkFieldPatchable(objectType, key);
    if (check.patchable) {
      patch.push({ op: "replace", path: toJsonPointer(key), value: before[key] ?? null });
    } else {
      excluded.push({ field: key, reason: check.reason ?? "not patchable" });
    }
  }

  if (patch.length === 0) {
    return {
      revertible: false,
      blockedReason:
        excluded.length > 0
          ? "None of the changed fields can be reverted via the API."
          : "No differences found between the two snapshots.",
      patch: [],
      excluded,
    };
  }

  return { revertible: true, patch, excluded };
}

/**
 * Compares a live-fetched object against what a snapshot expected it to be
 * (ignoring the same noise fields the diff view already excludes), to catch
 * "someone changed this again since we detected the original change" before
 * a revert is applied. Any real difference is treated as drift — the revert
 * should abort rather than silently proceed and possibly stomp on an
 * unrelated, legitimate change made after the snapshot was taken.
 */
export function findDrift(
  objectType: ObjectType,
  expected: RawObject,
  actual: RawObject
): string[] {
  const ignoreTop = IGNORED_TOP_LEVEL_FIELDS[objectType] ?? new Set<string>();
  const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  const drifted: string[] = [];
  for (const key of keys) {
    if (key === "id" || ignoreTop.has(key)) continue;
    if (JSON.stringify(expected[key]) !== JSON.stringify(actual[key])) drifted.push(key);
  }
  return drifted;
}
