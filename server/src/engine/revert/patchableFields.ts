import type { ObjectType } from "../types.js";

/**
 * Which top-level fields a JSON Patch can target, per object type.
 *
 * "allow" = only these fields are patchable (everything else is server-
 * managed or source-derived and will be rejected by the API).
 * "block" = everything is patchable except these.
 *
 * Roles, access profiles, and entitlements have documented enumerated
 * field lists — verified directly against developer.sailpoint.com on
 * 2026-09-09:
 *   - patch-role-v-1: developer.sailpoint.com/docs/api/patch-role-v-1
 *   - patch-access-profile-v-1: developer.sailpoint.com/docs/api/patch-access-profile-v-1
 *   - patch-entitlement-v-1: developer.sailpoint.com/docs/api/patch-entitlement-v-1
 *   - update-source-v-1 (sources' immutable-fields blocklist):
 *     developer.sailpoint.com/docs/api/update-source-v-1
 *
 * Workflows are the exception: patch-workflow-v-1 exists and is stable
 * (confirmed via the Workflows API category page), but its docs page did
 * not yield an enumerated patchable-field list the way the other four did.
 * Rather than guess a list and present it as verified, workflows use a
 * conservative blocklist of only the obviously server-managed fields
 * (id/created/modified). If the live API rejects a field this doesn't
 * catch, that rejection surfaces as-is from patchOne() rather than being
 * hidden — the API's own response is the actual source of truth here.
 */
type PatchableRule = { kind: "allow"; fields: Set<string> } | { kind: "block"; fields: Set<string> };

const PATCHABLE_FIELDS: Partial<Record<ObjectType, PatchableRule>> = {
  roles: {
    kind: "allow",
    fields: new Set([
      "name",
      "description",
      "enabled",
      "owner",
      "additionalOwners",
      "accessProfiles",
      "entitlements",
      "membership",
      "requestable",
      "accessRequestConfig",
      "revokeRequestConfig",
      "segments",
      "accessModelMetadata",
    ]),
  },
  "access-profiles": {
    kind: "allow",
    fields: new Set([
      "name",
      "description",
      "enabled",
      "owner",
      "additionalOwners",
      "requestable",
      "accessRequestConfig",
      "revokeRequestConfig",
      "segments",
      "entitlements",
      "provisioningCriteria",
      "source",
    ]),
  },
  entitlements: {
    kind: "allow",
    fields: new Set([
      "requestable",
      "segments",
      "privilegeOverride",
      "owner",
      "name",
      "description",
      "manuallyUpdatedFields",
      "accessModelMetadata",
    ]),
  },
  sources: {
    kind: "block",
    fields: new Set([
      "id",
      "type",
      "authoritative",
      "created",
      "modified",
      "connector",
      "connectorClass",
      "passwordPolicies",
    ]),
  },
  // Not doc-verified as an enumerated list — see module comment above.
  workflows: {
    kind: "block",
    fields: new Set(["id", "created", "modified"]),
  },
};

export interface FieldPatchability {
  patchable: boolean;
  reason?: string;
}

export function checkFieldPatchable(objectType: ObjectType, topLevelField: string): FieldPatchability {
  const rule = PATCHABLE_FIELDS[objectType];
  if (!rule) {
    return { patchable: false, reason: `${objectType} does not support revert.` };
  }
  if (rule.kind === "allow") {
    return rule.fields.has(topLevelField)
      ? { patchable: true }
      : { patchable: false, reason: `"${topLevelField}" is not independently patchable via the ISC API.` };
  }
  return rule.fields.has(topLevelField)
    ? { patchable: false, reason: `"${topLevelField}" is a server-managed field and cannot be changed.` }
    : { patchable: true };
}

export function supportsRevert(objectType: ObjectType): boolean {
  return objectType in PATCHABLE_FIELDS;
}
