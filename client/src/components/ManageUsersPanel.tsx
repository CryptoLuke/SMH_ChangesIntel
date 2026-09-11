import { useEffect, useState } from "react";
import { listWorkspaceUsers, addWorkspaceUser, type WorkspaceUserSummary } from "../api";

export function ManageUsersPanel() {
  const [users, setUsers] = useState<WorkspaceUserSummary[] | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "read-only">("read-only");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setUsers(await listWorkspaceUsers());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await addWorkspaceUser(username, password, role);
      setUsername("");
      setPassword("");
      setRole("read-only");
      setShowAddForm(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add user");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="run-history-label">Workspace users</div>
      {error && <div className="form-error">{error}</div>}
      {users === null ? (
        <div className="run-history-empty">Loading...</div>
      ) : (
        <div className="tenant-manage-list">
          {users.map((u) => (
            <div key={u.username} className="tenant-manage-item">
              <span className="tenant-manage-name">{u.username}</span>
              <span className="role-badge-inline">{u.role}</span>
            </div>
          ))}
        </div>
      )}

      {showAddForm ? (
        <form className="add-user-form" onSubmit={handleAdd}>
          <input
            className="field-input revert-input"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
          />
          <input
            className="field-input revert-input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="scope-grid">
            <div
              className={`scope-chip${role === "read-only" ? " selected" : ""}`}
              onClick={() => setRole("read-only")}
            >
              Read-only
            </div>
            <div className={`scope-chip${role === "admin" ? " selected" : ""}`} onClick={() => setRole("admin")}>
              Admin
            </div>
          </div>
          <div className="revert-panel-actions">
            <button className="revert-preview-button" type="submit" disabled={busy || !username || !password}>
              {busy ? "Adding..." : "Add user"}
            </button>
            <button type="button" className="revert-cancel-button" onClick={() => setShowAddForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button className="add-user-link" onClick={() => setShowAddForm(true)}>
          + Add user
        </button>
      )}
    </div>
  );
}
