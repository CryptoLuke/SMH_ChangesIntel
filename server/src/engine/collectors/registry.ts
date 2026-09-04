import type { ObjectType, RawObject, SessionToken, TenantConnection } from "../types.js";
import { fetchAll, fetchAllViaSearch } from "../iscClient.js";

/**
 * How each object type is retrieved.
 *
 * Endpoint paths verified directly against developer.sailpoint.com/docs/api
 * (not /v3 or /beta, which are the legacy/pre-release specs) on 2026-08-31:
 *   - List sources:         GET /sources/v1          (developer.sailpoint.com/docs/api/list-sources-v-1)
 *   - List access profiles: GET /access-profiles/v1   (developer.sailpoint.com/docs/api/list-access-profiles-v-1)
 *   - List roles:           GET /roles/v1             (developer.sailpoint.com/docs/api/list-roles-v-1)
 *   - List entitlements:    GET /entitlements/v1      (developer.sailpoint.com/docs/api/list-entitlements-v-1)
 *   - List workflows:       GET /workflows/v1         (developer.sailpoint.com/docs/api/list-workflows-v-1)
 *   - List identities:      GET /identities/v1        (developer.sailpoint.com/docs/api/list-identities-v-1)
 *
 * All are plain paginated REST lists (offset/limit), so every type here uses
 * the "list" collector. The "search" collector (fetchAllViaSearch, hitting
 * POST /search against an ISC search index) is kept available for object
 * types that don't have a dedicated list endpoint — none currently in scope
 * need it, since /identities/v1 covers identities directly.
 */
type CollectorDescriptor = { kind: "list"; path: string } | { kind: "search"; index: string };

const COLLECTORS: Record<ObjectType, CollectorDescriptor> = {
  sources: { kind: "list", path: "/sources/v1" },
  "access-profiles": { kind: "list", path: "/access-profiles/v1" },
  roles: { kind: "list", path: "/roles/v1" },
  entitlements: { kind: "list", path: "/entitlements/v1" },
  workflows: { kind: "list", path: "/workflows/v1" },
  identities: { kind: "list", path: "/identities/v1" },
};

export const DEFAULT_SCOPE: ObjectType[] = ["sources", "access-profiles", "workflows"];

export async function collectObjectType(
  conn: TenantConnection,
  token: SessionToken,
  objectType: ObjectType
): Promise<RawObject[]> {
  const collector = COLLECTORS[objectType];
  return collector.kind === "list"
    ? fetchAll(conn, token, collector.path)
    : fetchAllViaSearch(conn, token, collector.index);
}
