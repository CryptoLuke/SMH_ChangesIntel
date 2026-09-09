export type Role = "admin" | "read-only";

export interface DashboardUser {
  username: string;
  password: string;
  role: Role;
}

/**
 * Parses DASHBOARD_USERS_JSON into a list of named users with roles.
 *
 * Falls back to the legacy DASHBOARD_USER/DASHBOARD_PASSWORD pair — treated
 * as a single implicit admin — when DASHBOARD_USERS_JSON isn't set, so an
 * existing deployment doesn't break the moment this ships. Migrate to
 * DASHBOARD_USERS_JSON whenever convenient; both are never required at once.
 *
 * Throws with a clear message on malformed config — callers should let this
 * fail startup rather than silently run with no valid users.
 */
export function loadDashboardUsers(env: NodeJS.ProcessEnv = process.env): DashboardUser[] {
  const usersJson = env.DASHBOARD_USERS_JSON;

  if (usersJson) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(usersJson);
    } catch {
      throw new Error("DASHBOARD_USERS_JSON is not valid JSON.");
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("DASHBOARD_USERS_JSON must be a non-empty JSON array.");
    }
    return parsed.map((entry, i) => {
      const { username, password, role } = entry as Partial<DashboardUser>;
      if (typeof username !== "string" || !username) {
        throw new Error(`DASHBOARD_USERS_JSON[${i}]: "username" must be a non-empty string.`);
      }
      if (typeof password !== "string" || !password) {
        throw new Error(`DASHBOARD_USERS_JSON[${i}]: "password" must be a non-empty string.`);
      }
      if (role !== "admin" && role !== "read-only") {
        throw new Error(`DASHBOARD_USERS_JSON[${i}]: "role" must be "admin" or "read-only".`);
      }
      return { username, password, role };
    });
  }

  const legacyUser = env.DASHBOARD_USER;
  const legacyPassword = env.DASHBOARD_PASSWORD;
  if (legacyUser && legacyPassword) {
    return [{ username: legacyUser, password: legacyPassword, role: "admin" }];
  }

  return [];
}

/** {username: password} shape express-basic-auth's `users` option expects. */
export function toBasicAuthUsers(users: DashboardUser[]): Record<string, string> {
  return Object.fromEntries(users.map((u) => [u.username, u.password]));
}

export function toRoleLookup(users: DashboardUser[]): Record<string, Role> {
  return Object.fromEntries(users.map((u) => [u.username, u.role]));
}
