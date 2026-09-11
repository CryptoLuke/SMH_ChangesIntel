import { useState } from "react";
import { ALL_OBJECT_TYPES, OBJECT_TYPE_LABELS, type ObjectType } from "../types";
import { triggerRun } from "../api";
import type { RunReport } from "../types";

export interface RunPrefill {
  scope?: ObjectType[];
  lookbackDays?: number | null;
}

interface Props {
  onRunComplete: (run: RunReport) => void;
  /** Pre-fills the form — used when repeating a past run. Credentials are
   *  deliberately never part of this: they're never stored, so they can't
   *  be pre-filled, only retyped. */
  prefill?: RunPrefill;
}

export function NewRunForm({ onRunComplete, prefill }: Props) {
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [scope, setScope] = useState<ObjectType[]>(
    prefill?.scope ?? ["sources", "access-profiles", "workflows"]
  );
  const [lookbackDays, setLookbackDays] = useState(
    prefill?.lookbackDays ? String(prefill.lookbackDays) : ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleScope(type: ObjectType) {
    setScope((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!clientId || !clientSecret) {
      setError("Client ID and Client Secret are both required.");
      return;
    }
    if (scope.length === 0) {
      setError("Select at least one object type to collect.");
      return;
    }

    setSubmitting(true);
    try {
      const run = await triggerRun({
        clientId,
        clientSecret,
        scope,
        lookbackDays: lookbackDays ? Number(lookbackDays) : undefined,
        name: name.trim() || undefined,
      });
      setClientId("");
      setClientSecret("");
      onRunComplete(run);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="main-inner">
      <h1 className="form-title">New run</h1>
      <p className="form-subtitle">
        Collects the selected object types from this workspace's tenant and compares against the
        prior snapshot. Credentials are used only for this request and are never stored.
      </p>

      {error && <div className="form-error">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="field-group">
          <label className="field-label" htmlFor="runName">
            Run name <span className="field-label-optional">(optional)</span>
          </label>
          <input
            id="runName"
            className="field-input"
            style={{ fontFamily: "var(--sans)" }}
            placeholder="e.g. Baseline, Investigate"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
          />
          <div className="field-hint">
            Shows in the run history instead of the tenant name — handy for telling runs apart at
            a glance. Can be changed later too.
          </div>
        </div>

        <div className="two-col">
          <div className="field-group">
            <label className="field-label" htmlFor="clientId">
              Client ID
            </label>
            <input
              id="clientId"
              className="field-input"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="clientSecret">
              Client secret
            </label>
            <input
              id="clientSecret"
              type="password"
              className="field-input"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              autoComplete="off"
            />
          </div>
        </div>

        <div className="field-group">
          <label className="field-label">Object types to collect</label>
          <div className="scope-grid">
            {ALL_OBJECT_TYPES.map((type) => (
              <div
                key={type}
                className={`scope-chip${scope.includes(type) ? " selected" : ""}`}
                onClick={() => toggleScope(type)}
              >
                {OBJECT_TYPE_LABELS[type]}
              </div>
            ))}
          </div>
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="lookback">
            Trace back (days)
          </label>
          <input
            id="lookback"
            className="field-input"
            style={{ maxWidth: 160 }}
            placeholder="e.g. 7"
            value={lookbackDays}
            onChange={(e) => setLookbackDays(e.target.value.replace(/[^0-9]/g, ""))}
          />
          <div className="field-hint">
            Leave blank to compare against whatever the last run happened to be. Set a number to
            diff against the closest snapshot at least that many days old.
          </div>
        </div>

        <button className="run-submit" type="submit" disabled={submitting}>
          {submitting ? "Running..." : "Run collection"}
        </button>
      </form>
    </div>
  );
}
