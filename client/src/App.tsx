import { useEffect, useState } from "react";
import "./App.css";
import { Sidebar } from "./components/Sidebar";
import { NewRunForm, type RunPrefill } from "./components/NewRunForm";
import { RunDetail } from "./components/RunDetail";
import { listRuns, getRun } from "./api";
import type { RunReport, RunSummary } from "./types";

type View = { kind: "new-run" } | { kind: "run"; runId: string };

export default function App() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [view, setView] = useState<View>({ kind: "new-run" });
  const [selectedRun, setSelectedRun] = useState<RunReport | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Set only when jumping to "New run" via "Repeat this run" — cleared once
  // consumed so a manual "+ New run" click afterwards starts from a blank form.
  const [prefill, setPrefill] = useState<RunPrefill | undefined>(undefined);
  const [formKey, setFormKey] = useState(0);

  async function refreshRuns() {
    try {
      const data = await listRuns();
      setRuns(data);
      return data;
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load run history");
      return [];
    }
  }

  useEffect(() => {
    refreshRuns().then((data) => {
      if (data.length > 0) {
        setView({ kind: "run", runId: data[0].id });
      }
    });
  }, []);

  useEffect(() => {
    if (view.kind === "run") {
      getRun(view.runId)
        .then(setSelectedRun)
        .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load run"));
    } else {
      setSelectedRun(null);
    }
  }, [view]);

  async function handleRunComplete(run: RunReport) {
    await refreshRuns();
    setView({ kind: "run", runId: run.id });
  }

  function handleNewRun() {
    setPrefill(undefined);
    setFormKey((k) => k + 1);
    setView({ kind: "new-run" });
  }

  function handleRepeatRun(run: RunReport) {
    setPrefill({ baseUrl: run.baseUrl, scope: run.scope, lookbackDays: run.lookbackDays });
    setFormKey((k) => k + 1);
    setView({ kind: "new-run" });
  }

  return (
    <div className="app">
      <Sidebar
        runs={runs}
        selectedRunId={view.kind === "run" ? view.runId : null}
        onSelectRun={(id) => setView({ kind: "run", runId: id })}
        onNewRun={handleNewRun}
      />
      <main className="main">
        {loadError && <div className="form-error">{loadError}</div>}
        {view.kind === "new-run" && (
          <NewRunForm key={formKey} onRunComplete={handleRunComplete} prefill={prefill} />
        )}
        {view.kind === "run" &&
          (selectedRun ? (
            <RunDetail run={selectedRun} onRepeat={handleRepeatRun} />
          ) : (
            <div className="main-inner empty-state">Loading run...</div>
          ))}
      </main>
    </div>
  );
}
