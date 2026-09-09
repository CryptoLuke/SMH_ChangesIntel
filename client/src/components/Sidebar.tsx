import { useState } from "react";
import type { RunSummary } from "../types";
import type { WhoAmI } from "../api";

interface Props {
  runs: RunSummary[];
  selectedRunId: string | null;
  onSelectRun: (id: string) => void;
  onNewRun: () => void;
  onRenameRun: (id: string, name: string) => void;
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

export function Sidebar({ runs, selectedRunId, onSelectRun, onNewRun, onRenameRun, whoAmI }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

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

      {whoAmI.username && (
        <div className="signed-in-as">
          Signed in as <strong>{whoAmI.username}</strong>
          {whoAmI.role === "read-only" && <span className="role-badge">read-only</span>}
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
              return (
                <div
                  key={run.id}
                  className={`run-history-item${run.id === selectedRunId ? " active" : ""}`}
                  onClick={() => !isEditing && onSelectRun(run.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (!isEditing && (e.key === "Enter" || e.key === " ")) onSelectRun(run.id);
                  }}
                >
                  {isEditing ? (
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
                      <span className="tenant">{run.name || run.tenant}</span>
                      <button
                        className="rename-icon-button"
                        onClick={(e) => startEditing(run, e)}
                        title="Rename this run"
                        aria-label="Rename this run"
                      >
                        ✎
                      </button>
                    </div>
                  )}
                  <span className="meta">
                    {run.name ? `${run.tenant} · ` : ""}
                    {formatTimestamp(run.startedAt)} · {run.totalChanges} change
                    {run.totalChanges === 1 ? "" : "s"}
                    {run.triggeredBy ? ` · ${run.triggeredBy}` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
