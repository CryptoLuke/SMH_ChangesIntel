import { useState } from "react";
import type { ChangeRecord, RunReport } from "../types";
import { OBJECT_TYPE_LABELS } from "../types";
import { RevertPanel } from "./RevertPanel";
import { PencilIcon } from "./icons";
import type { WhoAmI } from "../api";

interface Props {
  run: RunReport;
  onRepeat: (run: RunReport) => void;
  onRename: (id: string, name: string) => void;
  onReverted: () => void;
  whoAmI: WhoAmI;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatValue(v: unknown): string {
  if (v === undefined) return "(none)";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function ChangeRow({
  change,
  runId,
  canRevert,
  onReverted,
}: {
  change: ChangeRecord;
  runId: string;
  canRevert: boolean;
  onReverted: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasFields = change.changedFields && change.changedFields.length > 0;
  const revertEligible = canRevert && change.changeType === "modified" && change.objectType !== "identities";

  return (
    <div className={`change-row ${change.changeType}`} onClick={() => hasFields && setExpanded((e) => !e)}>
      <div className="change-row-top">
        <span className={`change-type-label ${change.changeType}`}>{change.changeType}</span>
        <span className="change-name">{change.name ?? change.id}</span>
        {change.secondaryName && <span className="change-username">@{change.secondaryName}</span>}
        <span className="change-id">{change.id}</span>
      </div>
      {expanded && hasFields && (
        <ul className="field-diff-list">
          {change.changedFields!.map((f) => (
            <li key={f.field}>
              <span className="field-name">{f.field}:</span>{" "}
              <span className="before">{formatValue(f.before)}</span> {"->"}{" "}
              <span className="after">{formatValue(f.after)}</span>
            </li>
          ))}
        </ul>
      )}
      {revertEligible && (
        <RevertPanel
          runId={runId}
          objectType={change.objectType}
          objectId={change.id}
          onReverted={onReverted}
        />
      )}
    </div>
  );
}

export function RunDetail({ run, onRepeat, onRename, onReverted, whoAmI }: Props) {
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(run.name ?? "");
  const totalChanges = run.reports.reduce((sum, r) => sum + r.changes.length, 0);

  function commitName() {
    onRename(run.id, nameValue);
    setEditingName(false);
  }

  return (
    <div className="main-inner">
      <div className="run-header">
        {editingName ? (
          <input
            className="run-title-input"
            value={nameValue}
            autoFocus
            placeholder={run.tenant}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName();
              if (e.key === "Escape") {
                setNameValue(run.name ?? "");
                setEditingName(false);
              }
            }}
          />
        ) : (
          <h1>
            {run.name || run.tenant}{" "}
            <button
              className="rename-icon-button rename-icon-button-inline"
              onClick={() => setEditingName(true)}
              title="Rename this run"
              aria-label="Rename this run"
            >
              <PencilIcon />
            </button>
          </h1>
        )}
        <span className="timestamp">{formatTimestamp(run.startedAt)}</span>
      </div>
      <div className="run-baseline">
        {totalChanges} change{totalChanges === 1 ? "" : "s"} across {run.scope.length} object type
        {run.scope.length === 1 ? "" : "s"}
        {run.lookbackDays ? ` · ${run.lookbackDays}d lookback` : ""}
        {" · "}
        <button className="repeat-run-link" onClick={() => onRepeat(run)}>
          Repeat this run
        </button>
      </div>

      {run.reports.map((report) => (
        <div className="object-group" key={report.objectType}>
          <div className="object-group-header">
            {OBJECT_TYPE_LABELS[report.objectType]}
            {" · "}
            {report.changes.length} change{report.changes.length === 1 ? "" : "s"}
          </div>
          {report.changes.length === 0 ? (
            <div className="no-changes">
              {report.baselineSnapshotAt ? "No changes since baseline." : "First run — baseline established."}
            </div>
          ) : (
            report.changes.map((change) => (
              <ChangeRow
                key={change.id}
                change={change}
                runId={run.id}
                canRevert={whoAmI.role === "admin"}
                onReverted={onReverted}
              />
            ))
          )}
        </div>
      ))}
    </div>
  );
}
