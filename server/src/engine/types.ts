export interface TenantConnection {
  /** e.g. "https://your-org.api.identitynow.com" — no trailing slash */
  baseUrl: string;
  clientId: string;
  clientSecret: string;
}

/** Held only in memory for the lifetime of a single run. Never serialized. */
export interface SessionToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

/** The object types we know how to collect. Add more collectors as you expand scope. */
export type ObjectType =
  | "sources"
  | "access-profiles"
  | "roles"
  | "entitlements"
  | "workflows"
  | "identities";

/** A single ISC object as returned by the API, kept generic since shapes vary by type. */
export interface RawObject {
  id: string;
  name?: string;
  modified?: string;
  [key: string]: unknown;
}

/** One full pull of one object type at a point in time. */
export interface Snapshot {
  tenant: string;
  objectType: ObjectType;
  takenAt: string; // ISO timestamp
  objects: RawObject[];
}

export interface ChangeRecord {
  objectType: ObjectType;
  id: string;
  name?: string;
  /** e.g. an identity's username alongside its display name — set only when
   *  the object has both, to disambiguate duplicate display names. */
  secondaryName?: string;
  changeType: "added" | "removed" | "modified";
  changedFields?: FieldDiff[];
}

export interface FieldDiff {
  field: string;
  before: unknown;
  after: unknown;
}

export interface DiffReport {
  tenant: string;
  objectType: ObjectType;
  comparedAt: string;
  /** Requested trace-back window in days, or null for "just the prior snapshot". */
  lookbackDays: number | null;
  /** Actual timestamp of the baseline snapshot used — may be more recent than
   *  requested if no snapshot exists that far back yet. */
  baselineSnapshotAt: string | null;
  currentSnapshotAt: string;
  changes: ChangeRecord[];
}

/** A single triggered run across one or more object types — what the dashboard lists and displays. */
export interface RunReport {
  id: string;
  tenant: string;
  /** Saved so a run can be repeated without retyping it — not a secret, just a hostname. */
  baseUrl: string;
  startedAt: string;
  lookbackDays: number | null;
  scope: ObjectType[];
  reports: DiffReport[];
  /** Optional user-given label (e.g. "Baseline", "Investigate") — defaults
   *  to the tenant name in the UI when unset. */
  name?: string;
  /** Dashboard username that triggered this run (from Basic Auth), or a
   *  value from ISC_TRIGGERED_BY for CLI runs. Undefined when auth is
   *  disabled (local dev) or the CLI env var isn't set. */
  triggeredBy?: string;
  /** Audit trail of reverts applied against changes detected in this run. */
  reverts?: RevertRecord[];
}

export interface RevertRecord {
  objectType: ObjectType;
  objectId: string;
  appliedAt: string;
  appliedBy?: string;
  fieldsReverted: string[];
  excludedFields: string[];
}
