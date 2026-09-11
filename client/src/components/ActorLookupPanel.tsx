import { useState } from "react";
import { lookupActor, type ActorLookupResult } from "../api";
import type { ObjectType } from "../types";

interface Props {
  runId: string;
  objectType: ObjectType;
  objectId: string;
}

type Stage = "idle" | "form" | "result";

export function ActorLookupPanel({ runId, objectType, objectId }: Props) {
  const [stage, setStage] = useState<Stage>("idle");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActorLookupResult | null>(null);

  function stop(e: React.MouseEvent) {
    e.stopPropagation();
  }

  async function runLookup(e: React.MouseEvent) {
    stop(e);
    setBusy(true);
    const r = await lookupActor({ runId, objectType, objectId, clientId, clientSecret });
    setResult(r);
    setClientId("");
    setClientSecret("");
    setBusy(false);
    setStage("result");
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
        Who made this change?
      </button>
    );
  }

  return (
    <div className="revert-panel" onClick={stop}>
      {stage === "form" && (
        <>
          <div className="revert-panel-title">Who made this change?</div>
          <p className="revert-panel-hint">
            Looks up the matching audit event in ISC. Credentials are used only for this lookup and
            are never stored.
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
            <button className="revert-preview-button" disabled={busy || !clientId || !clientSecret} onClick={runLookup}>
              {busy ? "Looking up..." : "Look up"}
            </button>
            <button className="revert-cancel-button" onClick={(e) => { stop(e); setStage("idle"); }}>
              Cancel
            </button>
          </div>
        </>
      )}

      {stage === "result" && result && (
        <>
          {result.kind === "found" && (
            <div className="revert-success">
              <strong>{result.actorName}</strong> — {result.eventName} at{" "}
              {new Date(result.createdAt).toLocaleString()}
            </div>
          )}
          {result.kind === "not-found" && (
            <div className="revert-detail">No matching audit event found for this change.</div>
          )}
          {result.kind === "error" && (
            <div className="revert-conflict">
              <strong>{result.message}</strong>
            </div>
          )}
          <div className="revert-panel-actions">
            <button className="revert-cancel-button" onClick={(e) => { stop(e); setStage("idle"); }}>
              Close
            </button>
          </div>
        </>
      )}
    </div>
  );
}
