import type { RawObject, SessionToken, TenantConnection } from "./types.js";

const PAGE_SIZE = 250;

/**
 * Pages through any ISC v1 list endpoint using offset/limit, e.g.
 * fetchAll(conn, token, "/sources/v1") or fetchAll(conn, token, "/roles/v1").
 */
export async function fetchAll(
  conn: TenantConnection,
  token: SessionToken,
  path: string
): Promise<RawObject[]> {
  const results: RawObject[] = [];
  let offset = 0;

  while (true) {
    const url = `${conn.baseUrl}${path}?limit=${PAGE_SIZE}&offset=${offset}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token.accessToken}` },
    });

    if (!res.ok) {
      throw new Error(
        `ISC API request failed: ${res.status} ${res.statusText} (${path}, offset ${offset})`
      );
    }

    const page = (await res.json()) as RawObject[];
    results.push(...page);

    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return results;
}

/**
 * Pages through the ISC Search API (POST /search/v1) against a given index.
 * Used for object types whose plain REST list endpoint hits the platform's
 * documented 10,000-record offset-pagination ceiling (entitlements, in
 * large tenants) or has no list endpoint at all. Per SailPoint's own Search
 * API docs: "By default, you can page a maximum of 10,000 search result
 * records. To page past 10,000 records, you can use searchAfter paging."
 * That's exactly what this does — sorts by id and pages with searchAfter
 * rather than offset, so it scales to any tenant size.
 */
export async function fetchAllViaSearch(
  conn: TenantConnection,
  token: SessionToken,
  index: string
): Promise<RawObject[]> {
  const results: RawObject[] = [];
  let searchAfter: string[] | undefined;

  while (true) {
    const body: Record<string, unknown> = {
      indices: [index],
      query: { query: "*" },
      sort: ["id"],
      includeNested: false, // accounts/apps/access nested arrays aren't needed for change detection and bulk up every page
    };
    if (searchAfter) body.searchAfter = searchAfter;

    const res = await fetch(`${conn.baseUrl}/search/v1?limit=${PAGE_SIZE}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(
        `ISC search request failed: ${res.status} ${res.statusText} (index ${index})`
      );
    }

    const page = (await res.json()) as RawObject[];
    if (page.length === 0) break;
    results.push(...page);

    if (page.length < PAGE_SIZE) break;
    const lastId = page[page.length - 1]?.id;
    if (typeof lastId !== "string") break; // defensive — shouldn't happen since we sort by id
    searchAfter = [lastId];
  }

  return results;
}
