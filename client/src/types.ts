export type ObjectType =
  | "sources"
  | "access-profiles"
  | "roles"
  | "entitlements"
  | "workflows"
  | "identities";

export interface FieldDiff {
  field: string;
  before: unknown;
  after: unknown;
}

export interface ChangeRecord {
  objectType: ObjectType;
  id: string;
  name?: string;
  secondaryName?: string;
  changeType: "added" | "removed" | "modified";
  changedFields?: FieldDiff[];
}

export interface DiffReport {
  tenant: string;
  objectType: ObjectType;
  comparedAt: string;
  lookbackDays: number | null;
  baselineSnapshotAt: string | null;
  currentSnapshotAt: string;
  changes: ChangeRecord[];
}

export interface RunReport {
  id: string;
  tenant: string;
  baseUrl: string;
  startedAt: string;
  lookbackDays: number | null;
  scope: ObjectType[];
  reports: DiffReport[];
}

export interface RunSummary {
  id: string;
  tenant: string;
  startedAt: string;
  scope: ObjectType[];
  totalChanges: number;
}

export const ALL_OBJECT_TYPES: ObjectType[] = [
  "sources",
  "access-profiles",
  "roles",
  "entitlements",
  "workflows",
  "identities",
];

export const OBJECT_TYPE_LABELS: Record<ObjectType, string> = {
  sources: "Sources",
  "access-profiles": "Access profiles",
  roles: "Roles",
  entitlements: "Entitlements",
  workflows: "Workflows",
  identities: "Identities",
};
