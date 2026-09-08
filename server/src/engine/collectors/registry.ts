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
 *   - List workflows:       GET /workflows/v1         (developer.sailpoint.com/docs/api/list-workflows-v-1)
 *   - List identities:      GET /identities/v1        (developer.sailpoint.com/docs/api/list-identities-v-1)
 *
 * Entitlements are the exception: /entitlements/v1's offset pagination hits
 * a hard ceiling around 10,000 (confirmed directly — a live tenant with
 * >10k entitlements got a 400 at offset=10000), the same "from+size" window
 * limit Elasticsearch-backed endpoints commonly impose. "entitlements" is
 * one of the officially documented Search API indices (alongside
 * identities, roles, accessprofiles, events, accountactivities —
 * developer.sailpoint.com Search API docs), and that API's searchAfter
 * pagination has no such ceiling — same mechanism fetchAllViaSearch already
 * uses. So entitlements use "search" here while everything else uses the
 * plain REST list.
 */
type CollectorDescriptor = { kind: "list"; path: string } | { kind: "search"; index: string };

const COLLECTORS: Record<ObjectType, CollectorDescriptor> = {
  sources: { kind: "list", path: "/sources/v1" },
  "access-profiles": { kind: "list", path: "/access-profiles/v1" },
  roles: { kind: "list", path: "/roles/v1" },
  entitlements: { kind: "search", index: "entitlements" },
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
