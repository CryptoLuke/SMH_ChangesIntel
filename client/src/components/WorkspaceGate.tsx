import { useState } from "react";
import { checkWorkspace, createWorkspace, login, type WhoAmI } from "../api";

const LAST_BASE_URL_KEY = "isc-change-intel:lastBaseUrl";

type Stage =
  | { kind: "enter-url" }
  | { kind: "login"; orgName: string; baseUrl: string }
  | { kind: "create"; orgName: string; baseUrl: string };

interface Props {
  onLoggedIn: (user: WhoAmI) => void;
}

export function WorkspaceGate({ onLoggedIn }: Props) {
  const [stage, setStage] = useState<Stage>({ kind: "enter-url" });
  const [baseUrl, setBaseUrl] = useState(() => {
    try {
      return localStorage.getItem(LAST_BASE_URL_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleContinue(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { exists, orgName } = await checkWorkspace(baseUrl);
      try {
        localStorage.setItem(LAST_BASE_URL_KEY, baseUrl);
      } catch {
        // ignore — persistence is a convenience, not a requirement
      }
      setStage(exists ? { kind: "login", orgName, baseUrl } : { kind: "create", orgName, baseUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check that workspace");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (stage.kind !== "login") return;
    setError(null);
    setBusy(true);
    try {
      const user = await login(stage.orgName, username, password);
      onLoggedIn(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (stage.kind !== "create") return;
    setError(null);
    setBusy(true);
    try {
      const user = await createWorkspace(stage.baseUrl, username, password);
      onLoggedIn(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create workspace");
    } finally {
      setBusy(false);
    }
  }

  function goBack() {
    setStage({ kind: "enter-url" });
    setUsername("");
    setPassword("");
    setError(null);
  }

  return (
    <div className="gate-page">
      <div className="gate-card">
        <div className="gate-title">ISC change intel</div>
        <div className="gate-subtitle">Identity Security Cloud</div>

        {error && <div className="form-error">{error}</div>}

        {stage.kind === "enter-url" && (
          <form onSubmit={handleContinue}>
            <div className="field-group">
              <label className="field-label" htmlFor="gateBaseUrl">
                Tenant workspace URL
              </label>
              <input
                id="gateBaseUrl"
                className="field-input"
                placeholder="https://your-org.api.identitynow.com"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                autoComplete="off"
                autoFocus
              />
              <div className="field-hint">
                Each ISC tenant is its own workspace here. Enter yours to log in, or to set one up for
                the first time.
              </div>
            </div>
            <button className="run-submit" type="submit" disabled={busy || !baseUrl}>
              {busy ? "Checking..." : "Continue"}
            </button>
          </form>
        )}

        {stage.kind === "login" && (
          <form onSubmit={handleLogin}>
            <p className="gate-context">
              Workspace: <strong>{stage.orgName}</strong>
            </p>
            <div className="field-group">
              <label className="field-label" htmlFor="gateUsername">
                Username
              </label>
              <input
                id="gateUsername"
                className="field-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                autoComplete="username"
              />
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="gatePassword">
                Password
              </label>
              <input
                id="gatePassword"
                type="password"
                className="field-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="revert-panel-actions">
              <button className="run-submit" type="submit" disabled={busy || !username || !password}>
                {busy ? "Logging in..." : "Log in"}
              </button>
              <button type="button" className="revert-cancel-button" onClick={goBack}>
                ‹ Back
              </button>
            </div>
          </form>
        )}

        {stage.kind === "create" && (
          <form onSubmit={handleCreate}>
            <p className="gate-context">
              No workspace found for <strong>{stage.orgName}</strong>. Set one up — you'll become its
              first admin.
            </p>
            <div className="field-group">
              <label className="field-label" htmlFor="createUsername">
                Choose a username
              </label>
              <input
                id="createUsername"
                className="field-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                autoComplete="username"
              />
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="createPassword">
                Choose a password
              </label>
              <input
                id="createPassword"
                type="password"
                className="field-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="revert-panel-actions">
              <button className="run-submit" type="submit" disabled={busy || !username || !password}>
                {busy ? "Creating..." : "Create workspace"}
              </button>
              <button type="button" className="revert-cancel-button" onClick={goBack}>
                ‹ Back
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
