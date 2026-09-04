const PAGE_SIZE = 250;
/**
 * Pages through any ISC v3 list endpoint using offset/limit, e.g.
 * fetchAll(conn, token, "/v3/sources") or fetchAll(conn, token, "/v3/access-profiles").
 */
export async function fetchAll(conn, token, path) {
    const results = [];
    let offset = 0;
    while (true) {
        const url = `${conn.baseUrl}${path}?limit=${PAGE_SIZE}&offset=${offset}`;
        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token.accessToken}` },
        });
        if (!res.ok) {
            throw new Error(`ISC API request failed: ${res.status} ${res.statusText} (${path}, offset ${offset})`);
        }
        const page = (await res.json());
        results.push(...page);
        if (page.length < PAGE_SIZE)
            break;
        offset += PAGE_SIZE;
    }
    return results;
}
/**
 * Pages through the ISC Search API (POST /v3/search) against a given index.
 * Used for identities, which — unlike sources/roles/access-profiles/workflows
 * — have no plain REST list endpoint; Search is SailPoint's documented way
 * to bulk-retrieve them. See:
 * https://developer.sailpoint.com/discuss/t/a-complete-guide-to-retrieving-identity-data-via-the-identity-security-cloud-api/108723
 *
 * Sorts by id and pages with `searchAfter` rather than `offset` — offset
 * pagination on this endpoint stops working past 10,000 results, but
 * searchAfter has no such ceiling, so this scales to any tenant size.
 */
export async function fetchAllViaSearch(conn, token, index) {
    const results = [];
    let searchAfter;
    while (true) {
        const body = {
            indices: [index],
            query: { query: "*" },
            sort: ["id"],
            includeNested: false, // accounts/apps/access nested arrays aren't needed for change detection and bulk up every page
        };
        if (searchAfter)
            body.searchAfter = searchAfter;
        const res = await fetch(`${conn.baseUrl}/v3/search?limit=${PAGE_SIZE}`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token.accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            throw new Error(`ISC search request failed: ${res.status} ${res.statusText} (index ${index})`);
        }
        const page = (await res.json());
        if (page.length === 0)
            break;
        results.push(...page);
        if (page.length < PAGE_SIZE)
            break;
        const lastId = page[page.length - 1]?.id;
        if (typeof lastId !== "string")
            break; // defensive — shouldn't happen since we sort by id
        searchAfter = [lastId];
    }
    return results;
}
