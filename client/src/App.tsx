import { useEffect, useState } from "react";
import "./App.css";
import { Sidebar } from "./components/Sidebar";
import { NewRunForm, type RunPrefill } from "./components/NewRunForm";
import { RunDetail } from "./components/RunDetail";
import { WorkspaceGate } from "./components/WorkspaceGate";
import { OwnerPanel } from "./components/OwnerPanel";
import { listRuns, getRun, renameRun, getWhoAmI, deleteRun, deleteWorkspace, logout, type WhoAmI } from "./api";
import type { RunReport, RunSummary } from "./types";

type View = { kind: "new-run" } | { kind: "run"; runId: string };
type AuthState = { kind: "loading" } | { kind: "logged-out" } | { kind: "logged-in"; user: WhoAmI };

export default function App() {
  // A separate, static entry point — /owner is its own identity, entirely
  // outside the workspace login flow. Checked here, before WorkspaceApp's
  // hooks exist at all, so this is a plain conditional render, not a
  // conditional hook call.
  if (window.location.pathname === "/owner") {
    return <OwnerPanel />;
  }
  return <WorkspaceApp />;
}

function WorkspaceApp() {
  const [auth, setAuth] = useState<AuthState>({ kind: "loading" });
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
    getWhoAmI().then((user) => {
      setAuth(user.orgName ? { kind: "logged-in", user } : { kind: "logged-out" });
    });
  }, []);

  useEffect(() => {
    if (auth.kind !== "logged-in") return;
    refreshRuns().then((data) => {
      if (data.length > 0) setView({ kind: "run", runId: data[0].id });
    });
  }, [auth.kind]);

  useEffect(() => {
    if (auth.kind !== "logged-in") return;
    if (view.kind === "run") {
      getRun(view.runId)
        .then(setSelectedRun)
        .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load run"));
    } else {
      setSelectedRun(null);
    }
  }, [view, auth.kind]);

  function handleLoggedIn(user: WhoAmI) {
    setAuth({ kind: "logged-in", user });
  }

  async function handleLogout() {
    await logout();
    setAuth({ kind: "logged-out" });
    setRuns([]);
    setSelectedRun(null);
    setView({ kind: "new-run" });
  }

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
    setPrefill({ scope: run.scope, lookbackDays: run.lookbackDays });
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

  async function handleDeleteRun(id: string) {
    try {
      await deleteRun(id);
      const data = await refreshRuns();
      if (view.kind === "run" && view.runId === id) {
        // Currently viewing the run we just deleted — move to whatever's
        // next, or the new-run form if nothing's left.
        if (data.length > 0) setView({ kind: "run", runId: data[0].id });
        else handleNewRun();
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to delete run");
    }
  }

  async function handleDeleteWorkspace() {
    try {
      await deleteWorkspace();
      // The server destroys the session as part of this — nothing left to
      // be logged into.
      setAuth({ kind: "logged-out" });
      setRuns([]);
      setSelectedRun(null);
      setView({ kind: "new-run" });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to delete workspace");
    }
  }

  if (auth.kind === "loading") {
    return <div className="gate-page" />;
  }

  if (auth.kind === "logged-out") {
    return <WorkspaceGate onLoggedIn={handleLoggedIn} />;
  }

  return (
    <div className="app">
      <Sidebar
        runs={runs}
        selectedRunId={view.kind === "run" ? view.runId : null}
        onSelectRun={(id) => setView({ kind: "run", runId: id })}
        onNewRun={handleNewRun}
        onRenameRun={handleRenameRun}
        onDeleteRun={handleDeleteRun}
        onDeleteWorkspace={handleDeleteWorkspace}
        onLogout={handleLogout}
        whoAmI={auth.user}
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
              whoAmI={auth.user}
            />
          ) : (
            <div className="main-inner empty-state">Loading run...</div>
          ))}
      </main>
    </div>
  );
}
