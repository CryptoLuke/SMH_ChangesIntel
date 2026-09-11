import { useEffect, useState } from "react";
import { listWorkspaceUsers, addWorkspaceUser, removeWorkspaceUser, type WorkspaceUserSummary } from "../api";

interface Props {
  currentUsername?: string;
}

export function ManageUsersPanel({ currentUsername }: Props) {
  const [users, setUsers] = useState<WorkspaceUserSummary[] | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "read-only">("read-only");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);

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

  async function handleRemove(targetUsername: string) {
    setError(null);
    try {
      await removeWorkspaceUser(targetUsername);
      setConfirmingRemove(null);
      if (targetUsername === currentUsername) {
        // Removing yourself destroys your own session server-side — reload
        // so the app correctly re-checks auth and shows the login screen.
        window.location.reload();
        return;
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove user");
      setConfirmingRemove(null);
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
          {users.map((u) =>
            confirmingRemove === u.username ? (
              <div key={u.username} className="delete-confirm-row">
                <span className="delete-confirm-text">Remove {u.username}?</span>
                <button className="delete-confirm-yes" onClick={() => handleRemove(u.username)}>
                  Yes
                </button>
                <button className="delete-confirm-no" onClick={() => setConfirmingRemove(null)}>
                  No
                </button>
              </div>
            ) : (
              <div key={u.username} className="tenant-manage-item">
                <span className="tenant-manage-name">
                  {u.username}
                  {u.username === currentUsername ? " (you)" : ""}
                </span>
                <span className="user-row-right">
                  <span className="role-badge-inline">{u.role}</span>
                  <button
                    className="rename-icon-button delete-icon-button"
                    onClick={() => setConfirmingRemove(u.username)}
                    title={`Remove ${u.username}`}
                    aria-label={`Remove ${u.username}`}
                  >
                    🗑
                  </button>
                </span>
              </div>
            )
          )}
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
