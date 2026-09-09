import { useEffect, useState } from "react";
import "./App.css";
import { Sidebar } from "./components/Sidebar";
import { NewRunForm, type RunPrefill } from "./components/NewRunForm";
import { RunDetail } from "./components/RunDetail";
import { listRuns, getRun, renameRun, getWhoAmI, type WhoAmI } from "./api";
import type { RunReport, RunSummary } from "./types";

type View = { kind: "new-run" } | { kind: "run"; runId: string };

export default function App() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [view, setView] = useState<View>({ kind: "new-run" });
  const [selectedRun, setSelectedRun] = useState<RunReport | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [whoAmI, setWhoAmI] = useState<WhoAmI>({});
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
    getWhoAmI()
      .then(setWhoAmI)
      .catch(() => {
        // Non-fatal — the app still works without a displayed username;
        // this just means the sidebar won't show who's signed in.
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

  async function handleRenameRun(id: string, name: string) {
    try {
      const updated = await renameRun(id, name);
      await refreshRuns();
      if (selectedRun?.id === id) setSelectedRun(updated);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to rename run");
    }
  }

  async function handleReverted() {
    // Re-fetch the current run so the audit trail (run.reverts) and any
    // dependent state reflect the just-applied revert.
    if (view.kind === "run") {
      try {
        setSelectedRun(await getRun(view.runId));
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Failed to refresh run after revert");
      }
    }
  }

  return (
    <div className="app">
      <Sidebar
        runs={runs}
        selectedRunId={view.kind === "run" ? view.runId : null}
        onSelectRun={(id) => setView({ kind: "run", runId: id })}
        onNewRun={handleNewRun}
        onRenameRun={handleRenameRun}
        whoAmI={whoAmI}
      />
      <main className="main">
        {loadError && <div className="form-error">{loadError}</div>}
        {view.kind === "new-run" && (
          <NewRunForm key={formKey} onRunComplete={handleRunComplete} prefill={prefill} />
        )}
        {view.kind === "run" &&
          (selectedRun ? (
            <RunDetail
              key={selectedRun.id}
              run={selectedRun}
              onRepeat={handleRepeatRun}
              onRename={handleRenameRun}
              onReverted={handleReverted}
              whoAmI={whoAmI}
            />
          ) : (
            <div className="main-inner empty-state">Loading run...</div>
          ))}
      </main>
    </div>
  );
}
