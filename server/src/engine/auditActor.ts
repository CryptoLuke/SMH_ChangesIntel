import type { ObjectType, SessionToken, TenantConnection } from "./types.js";

/**
 * Maps our object types to the human-readable label ISC uses in its audit
 * event names — confirmed directly from a live tenant's Search UI: a
 * source update event is named exactly "Update Source Passed". Identities
 * are deliberately absent — their changes come from aggregation/HR data,
 * not a specific ISC user action, so "who did this" doesn't apply the
 * same way.
 */
const OBJECT_EVENT_LABEL: Partial<Record<ObjectType, string>> = {
  sources: "Source",
  "access-profiles": "Access Profile",
  roles: "Role",
  entitlements: "Entitlement",
  workflows: "Workflow",
};

const OPERATION_VERB: Record<"added" | "modified" | "removed", string> = {
  added: "Create",
  modified: "Update",
  removed: "Delete",
};

function escapeQueryPhrase(value: string): string {
  return value.replace(/"/g, '\\"');
}

export interface AuditActorResult {
  actorName: string;
  eventName: string;
  createdAt: string;
}

/**
 * Looks up who made a specific detected change, via the ISC Search API's
 * "events" index. Matches on the event's name — a predictable
 * "<Operation> <Object> Passed" pattern (confirmed: "Update Source
 * Passed") — plus the object's own name, within the exact window the
 * change was detected in (the baseline-to-current snapshot timestamps).
 *
 * Deliberately conservative: only the simple query-string syntax already
 * confirmed working elsewhere in this app is used here (quoted-phrase
 * AND, plus the RANGE filter pattern) — not the DSL clause types (match,
 * match_phrase) that weren't directly verified. Returns null on no match
 * or any error, rather than guessing — a missing actor is safer than a
 * wrong one shown confidently.
 */
export async function findActorForChange(
  conn: TenantConnection,
  token: SessionToken,
  objectType: ObjectType,
  changeType: "added" | "modified" | "removed",
  objectName: string,
  windowStart: string,
  windowEnd: string
): Promise<AuditActorResult | null> {
  const objectLabel = OBJECT_EVENT_LABEL[objectType];
  if (!objectLabel) return null;

  const eventName = `${OPERATION_VERB[changeType]} ${objectLabel} Passed`;
  const query = `name:"${escapeQueryPhrase(eventName)}" AND target.name:"${escapeQueryPhrase(objectName)}"`;

  const body = {
    indices: ["events"],
    query: { query },
    filters: {
      created: {
        type: "RANGE",
        range: { lower: { value: windowStart }, upper: { value: windowEnd } },
      },
    },
  };

  let res: Response;
  try {
    res = await fetch(`${conn.baseUrl}/search/v1?limit=10`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  let events: Array<{ actor?: { name?: string }; name?: string; created?: string }>;
  try {
    events = await res.json();
  } catch {
    return null;
  }
  if (!Array.isArray(events) || events.length === 0) return null;

  // Take the most recent match within the window, in case more than one
  // qualifying event happened to fall inside it.
  const mostRecent = events.reduce(
    (latest, ev) => (ev.created && ev.created > (latest.created ?? "") ? ev : latest),
    events[0]
  );

  if (!mostRecent?.actor?.name) return null;
  return {
    actorName: mostRecent.actor.name,
    eventName: mostRecent.name ?? eventName,
    createdAt: mostRecent.created ?? "",
  };
}
