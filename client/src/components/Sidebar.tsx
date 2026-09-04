import type { RunSummary } from "../types";

interface Props {
  runs: RunSummary[];
  selectedRunId: string | null;
  onSelectRun: (id: string) => void;
  onNewRun: () => void;
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

export function Sidebar({ runs, selectedRunId, onSelectRun, onNewRun }: Props) {
  return (
    <aside className="sidebar">
      <div className="sidebar-title">
        ISC change intel
        <span>Identity Security Cloud</span>
      </div>

      <button className="new-run-button" onClick={onNewRun}>
        + New run
      </button>

      <div>
        <div className="run-history-label">Run history</div>
        {runs.length === 0 ? (
          <div className="run-history-empty">No runs yet.</div>
        ) : (
          <div className="run-history-list">
            {runs.map((run) => (
              <button
                key={run.id}
                className={`run-history-item${run.id === selectedRunId ? " active" : ""}`}
                onClick={() => onSelectRun(run.id)}
              >
                <span className="tenant">{run.tenant}</span>
                <span className="meta">
                  {formatTimestamp(run.startedAt)} · {run.totalChanges} change
                  {run.totalChanges === 1 ? "" : "s"}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
