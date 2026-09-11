import { useEffect, useState } from "react";
import { getOwnerWhoAmI, ownerLogin, ownerLogout, listAllWorkspaces, type WorkspaceSummary } from "../api";

type State = { kind: "loading" } | { kind: "logged-out" } | { kind: "logged-in" };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function OwnerPanel() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[] | null>(null);

  useEffect(() => {
    getOwnerWhoAmI().then((isOwner) => setState({ kind: isOwner ? "logged-in" : "logged-out" }));
  }, []);

  useEffect(() => {
    if (state.kind === "logged-in") {
      listAllWorkspaces()
        .then(setWorkspaces)
        .catch((err) => setError(err instanceof Error ? err.message : "Failed to load workspaces"));
    }
  }, [state.kind]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await ownerLogin(username, password);
      setState({ kind: "logged-in" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    await ownerLogout();
    setState({ kind: "logged-out" });
    setWorkspaces(null);
  }

  if (state.kind === "loading") {
    return <div className="gate-page" />;
  }

  if (state.kind === "logged-out") {
    return (
      <div className="gate-page">
        <div className="gate-card">
          <div className="gate-title">Owner panel</div>
          <div className="gate-subtitle">Monitoring view across all workspaces</div>
          {error && <div className="form-error">{error}</div>}
          <form onSubmit={handleLogin}>
            <div className="field-group">
              <label className="field-label" htmlFor="ownerUsername">
                Username
              </label>
              <input
                id="ownerUsername"
                className="field-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                autoComplete="username"
              />
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="ownerPassword">
                Password
              </label>
              <input
                id="ownerPassword"
                type="password"
                className="field-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <button className="run-submit" type="submit" disabled={busy || !username || !password}>
              {busy ? "Logging in..." : "Log in"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="main" style={{ gridColumn: "1 / -1" }}>
      <div className="main-inner" style={{ maxWidth: 900 }}>
        <div className="run-header">
          <h1>Owner panel</h1>
          <button className="logout-link" onClick={handleLogout}>
            Log out
          </button>
        </div>
        <p className="run-baseline">
          Every registered workspace. Names, base URLs, creation dates, and user counts only — no
          run data, no user credentials.
        </p>

        {error && <div className="form-error">{error}</div>}

        {workspaces === null ? (
          <div className="run-history-empty">Loading...</div>
        ) : workspaces.length === 0 ? (
          <div className="empty-state">No workspaces created yet.</div>
        ) : (
          <table className="owner-table">
            <thead>
              <tr>
                <th>Workspace</th>
                <th>Base URL</th>
                <th>Created</th>
                <th>Users</th>
              </tr>
            </thead>
            <tbody>
              {workspaces.map((w) => (
                <tr key={w.orgName}>
                  <td className="owner-table-org">{w.orgName}</td>
                  <td className="owner-table-url">{w.baseUrl}</td>
                  <td>{formatDate(w.createdAt)}</td>
                  <td>{w.userCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
