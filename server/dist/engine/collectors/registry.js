import { fetchAll, fetchAllViaSearch } from "../iscClient.js";
const COLLECTORS = {
    sources: { kind: "list", path: "/sources/v1" },
    "access-profiles": { kind: "list", path: "/access-profiles/v1" },
    roles: { kind: "list", path: "/roles/v1" },
    entitlements: { kind: "list", path: "/entitlements/v1" },
    workflows: { kind: "list", path: "/workflows/v1" },
    identities: { kind: "list", path: "/identities/v1" },
};
export const DEFAULT_SCOPE = ["sources", "access-profiles", "workflows"];
export async function collectObjectType(conn, token, objectType) {
    const collector = COLLECTORS[objectType];
    return collector.kind === "list"
        ? fetchAll(conn, token, collector.path)
        : fetchAllViaSearch(conn, token, collector.index);
}
