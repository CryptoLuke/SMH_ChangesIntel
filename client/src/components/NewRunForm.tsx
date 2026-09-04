import { useState } from "react";
import { ALL_OBJECT_TYPES, OBJECT_TYPE_LABELS, type ObjectType } from "../types";
import { triggerRun } from "../api";
import type { RunReport } from "../types";

const LAST_BASE_URL_KEY = "isc-change-intel:lastBaseUrl";

export interface RunPrefill {
  baseUrl?: string;
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

function loadDefaultBaseUrl(prefill?: RunPrefill): string {
  if (prefill?.baseUrl) return prefill.baseUrl;
  try {
    return localStorage.getItem(LAST_BASE_URL_KEY) ?? "";
  } catch {
    return ""; // localStorage unavailable (e.g. private browsing) — just start blank
  }
}

export function NewRunForm({ onRunComplete, prefill }: Props) {
  const [baseUrl, setBaseUrl] = useState(() => loadDefaultBaseUrl(prefill));
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

    if (!baseUrl || !clientId || !clientSecret) {
      setError("Base URL, Client ID, and Client Secret are all required.");
      return;
    }
    if (scope.length === 0) {
      setError("Select at least one object type to collect.");
      return;
    }

    setSubmitting(true);
    try {
      const run = await triggerRun({
        baseUrl,
        clientId,
        clientSecret,
        scope,
        lookbackDays: lookbackDays ? Number(lookbackDays) : undefined,
      });

      // Remember the base URL for next time — it's just a hostname, not a
      // secret. Credentials are cleared and never touch storage.
      try {
        localStorage.setItem(LAST_BASE_URL_KEY, baseUrl);
      } catch {
        // ignore — persistence is a convenience, not a requirement
      }
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
        Connects to your tenant, collects the selected object types, and compares against the
        prior snapshot. Credentials are used only for this request and are never stored.
      </p>

      {error && <div className="form-error">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="field-group">
          <label className="field-label" htmlFor="baseUrl">
            Tenant base URL
          </label>
          <input
            id="baseUrl"
            className="field-input"
            placeholder="https://your-org.api.identitynow.com"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            autoComplete="off"
          />
          <div className="field-hint">Remembered on this browser after your first run — edit anytime.</div>
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
