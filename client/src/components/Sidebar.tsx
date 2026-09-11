import { useState } from "react";
import type { RunSummary } from "../types";
import type { WhoAmI } from "../api";
import { ManageUsersPanel } from "./ManageUsersPanel";

interface Props {
  runs: RunSummary[];
  selectedRunId: string | null;
  onSelectRun: (id: string) => void;
  onNewRun: () => void;
  onRenameRun: (id: string, name: string) => void;
  onDeleteRun: (id: string) => void;
  onDeleteWorkspace: () => void;
  onLogout: () => void;
  whoAmI: WhoAmI;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function Sidebar({
  runs,
  selectedRunId,
  onSelectRun,
  onNewRun,
  onRenameRun,
  onDeleteRun,
  onDeleteWorkspace,
  onLogout,
  whoAmI,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [confirmingWorkspaceDelete, setConfirmingWorkspaceDelete] = useState(false);
  const [workspaceConfirmText, setWorkspaceConfirmText] = useState("");

  const isAdmin = whoAmI.role === "admin";

  function startEditing(run: RunSummary, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingId(run.id);
    setEditValue(run.name ?? "");
  }

  function commitEdit(id: string) {
    onRenameRun(id, editValue);
    setEditingId(null);
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-title">
        ISC change intel
        <span>Identity Security Cloud</span>
      </div>

      {whoAmI.orgName && (
        <div className="workspace-badge">
          <div className="workspace-label">Tenant workspace</div>
          <div className="workspace-name">{whoAmI.orgName}</div>
        </div>
      )}

      {whoAmI.username && (
        <div className="signed-in-as">
          Signed in as <strong>{whoAmI.username}</strong>
          {whoAmI.role === "read-only" && <span className="role-badge">read-only</span>}
          <button className="logout-link" onClick={onLogout}>
            Log out
          </button>
        </div>
      )}

      <button className="new-run-button" onClick={onNewRun}>
        + New run
      </button>

      <div>
        <div className="run-history-label">Run history</div>
        {runs.length === 0 ? (
          <div className="run-history-empty">No runs yet.</div>
        ) : (
          <div className="run-history-list">
            {runs.map((run) => {
              const isEditing = editingId === run.id;
              const isConfirmingDelete = confirmingDeleteId === run.id;
              return (
                <div
                  key={run.id}
                  className={`run-history-item${run.id === selectedRunId ? " active" : ""}`}
                  onClick={() => !isEditing && !isConfirmingDelete && onSelectRun(run.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (!isEditing && !isConfirmingDelete && (e.key === "Enter" || e.key === " ")) onSelectRun(run.id);
                  }}
                >
                  {isConfirmingDelete ? (
                    <div className="delete-confirm-row" onClick={(e) => e.stopPropagation()}>
                      <span className="delete-confirm-text">Delete this run?</span>
                      <button
                        className="delete-confirm-yes"
                        onClick={() => {
                          onDeleteRun(run.id);
                          setConfirmingDeleteId(null);
                        }}
                      >
                        Yes
                      </button>
                      <button className="delete-confirm-no" onClick={() => setConfirmingDeleteId(null)}>
                        No
                      </button>
                    </div>
                  ) : isEditing ? (
                    <input
                      className="run-rename-input"
                      value={editValue}
                      autoFocus
                      onChange={(e) => setEditValue(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={() => commitEdit(run.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit(run.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                    />
                  ) : (
                    <div className="run-history-item-top">
                      <span className="tenant">{run.name || formatTimestamp(run.startedAt)}</span>
                      <span className="run-item-icons">
                        <button
                          className="rename-icon-button"
                          onClick={(e) => startEditing(run, e)}
                          title="Rename this run"
                          aria-label="Rename this run"
                        >
                          ✎
                        </button>
                        {isAdmin && (
                          <button
                            className="rename-icon-button delete-icon-button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmingDeleteId(run.id);
                            }}
                            title="Delete this run"
                            aria-label="Delete this run"
                          >
                            🗑
                          </button>
                        )}
                      </span>
                    </div>
                  )}
                  {!isConfirmingDelete && (
                    <span className="meta">
                      {formatTimestamp(run.startedAt)} · {run.totalChanges} change
                      {run.totalChanges === 1 ? "" : "s"}
                      {run.triggeredBy ? ` · ${run.triggeredBy}` : ""}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {isAdmin && (
        <>
          <ManageUsersPanel currentUsername={whoAmI.username} />

          <div>
            <div className="run-history-label">Danger zone</div>
            {confirmingWorkspaceDelete ? (
              <div className="tenant-delete-confirm">
                <div className="tenant-delete-warning">
                  This permanently deletes every run, every snapshot, and every user for this
                  workspace. Type the workspace name (<strong>{whoAmI.orgName}</strong>) to confirm:
                </div>
                <input
                  className="run-rename-input"
                  value={workspaceConfirmText}
                  onChange={(e) => setWorkspaceConfirmText(e.target.value)}
                  placeholder={whoAmI.orgName}
                />
                <div className="tenant-delete-actions">
                  <button
                    className="delete-confirm-yes"
                    disabled={workspaceConfirmText !== whoAmI.orgName}
                    onClick={() => {
                      onDeleteWorkspace();
                      setConfirmingWorkspaceDelete(false);
                      setWorkspaceConfirmText("");
                    }}
                  >
                    Delete permanently
                  </button>
                  <button
                    className="delete-confirm-no"
                    onClick={() => {
                      setConfirmingWorkspaceDelete(false);
                      setWorkspaceConfirmText("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button className="delete-workspace-link" onClick={() => setConfirmingWorkspaceDelete(true)}>
                Delete this workspace
              </button>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
