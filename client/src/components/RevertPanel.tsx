import { useState } from "react";
import { revertChange, type RevertResult } from "../api";
import type { ObjectType } from "../types";

interface Props {
  runId: string;
  objectType: ObjectType;
  objectId: string;
  onReverted: () => void;
}

type Stage = "idle" | "form" | "preview" | "done";

export function RevertPanel({ runId, objectType, objectId, onReverted }: Props) {
  const [stage, setStage] = useState<Stage>("idle");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RevertResult | null>(null);

  async function runPreview(e: React.MouseEvent) {
    e.stopPropagation();
    setBusy(true);
    const r = await revertChange({ runId, objectType, objectId, clientId, clientSecret, dryRun: true });
    setResult(r);
    setBusy(false);
    setStage("preview");
  }

  async function runApply(e: React.MouseEvent) {
    e.stopPropagation();
    setBusy(true);
    const r = await revertChange({ runId, objectType, objectId, clientId, clientSecret, dryRun: false });
    setResult(r);
    setBusy(false);
    setStage("done");
    if (r.kind === "applied") {
      setClientId("");
      setClientSecret("");
      onReverted();
    }
  }

  function stop(e: React.MouseEvent) {
    e.stopPropagation();
  }

  if (stage === "idle") {
    return (
      <button
        className="revert-link"
        onClick={(e) => {
          stop(e);
          setStage("form");
        }}
      >
        Revert this change
      </button>
    );
  }

  return (
    <div className="revert-panel" onClick={stop}>
      {stage === "form" && (
        <>
          <div className="revert-panel-title">Revert this change</div>
          <p className="revert-panel-hint">
            Credentials are used only for this action and are never stored. Requires admin.
          </p>
          <div className="two-col">
            <input
              className="field-input revert-input"
              placeholder="Client ID"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            />
            <input
              className="field-input revert-input"
              type="password"
              placeholder="Client secret"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
            />
          </div>
          <div className="revert-panel-actions">
            <button className="revert-preview-button" disabled={busy || !clientId || !clientSecret} onClick={runPreview}>
              {busy ? "Checking..." : "Preview"}
            </button>
            <button className="revert-cancel-button" onClick={(e) => { stop(e); setStage("idle"); }}>
              Cancel
            </button>
          </div>
        </>
      )}

      {stage === "preview" && result && (
        <>
          {result.kind === "conflict" && (
            <div className="revert-conflict">
              <strong>Can't revert — {result.message}</strong>
              <div className="revert-detail">Drifted fields: {result.driftedFields.join(", ")}</div>
            </div>
          )}
          {result.kind === "blocked" && (
            <div className="revert-blocked">
              <strong>{result.blockedReason}</strong>
              {result.excluded.length > 0 && (
                <ul className="revert-excluded-list">
                  {result.excluded.map((ex) => (
                    <li key={ex.field}>{ex.field}: {ex.reason}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {result.kind === "error" && <div className="revert-conflict"><strong>{result.message}</strong></div>}
          {result.kind === "preview" && (
            <>
              <div className="revert-panel-title">This will send:</div>
              <pre className="revert-request-preview">
                {result.request.method} {result.request.path}
                {"\n"}
                {JSON.stringify(result.request.body, null, 2)}
              </pre>
              {result.excluded.length > 0 && (
                <div className="revert-excluded">
                  <div className="revert-detail">Not included (can't be reverted via the API):</div>
                  <ul className="revert-excluded-list">
                    {result.excluded.map((ex) => (
                      <li key={ex.field}>{ex.field}: {ex.reason}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="revert-panel-actions">
                <button className="revert-apply-button" disabled={busy} onClick={runApply}>
                  {busy ? "Applying..." : "Confirm & apply"}
                </button>
                <button className="revert-cancel-button" onClick={(e) => { stop(e); setStage("idle"); }}>
                  Cancel
                </button>
              </div>
            </>
          )}
          {(result.kind === "conflict" || result.kind === "blocked" || result.kind === "error") && (
            <div className="revert-panel-actions">
              <button className="revert-cancel-button" onClick={(e) => { stop(e); setStage("idle"); }}>
                Close
              </button>
            </div>
          )}
        </>
      )}

      {stage === "done" && result?.kind === "applied" && (
        <div className="revert-success">
          <strong>Reverted.</strong> The field{result.request.body.length === 1 ? "" : "s"}{" "}
          {result.request.body.map((op) => op.path.slice(1)).join(", ")} {result.request.body.length === 1 ? "was" : "were"} restored.
        </div>
      )}
      {stage === "done" && result?.kind !== "applied" && (
        <div className="revert-conflict">
          <strong>Revert did not apply.</strong>{" "}
          {result?.kind === "conflict" ? result.message : result?.kind === "error" ? result.message : "See details above."}
        </div>
      )}
    </div>
  );
}
