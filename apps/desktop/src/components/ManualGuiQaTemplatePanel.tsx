import type { PackagedStatusResponse } from "../api/types";

export function ManualGuiQaTemplatePanel({ status }: { status?: PackagedStatusResponse | null }) {
  const handoff = status?.manualGuiQaHandoff;
  const result = status?.manualGuiQaResult;

  return (
    <section className="panel" aria-label="Windows manual GUI QA template">
      <h2>Manual GUI QA Template</h2>
      <p className="notice-text">
        Automated packaging smokes do not mark manual GUI QA as complete. The manual template is a
        reviewer handoff artifact: every step starts as pending, reviewer fields start empty, and
        productionReady remains false.
      </p>
      <div className="summary-row">
        <span className="status-pill">template: pending</span>
        <span className="status-pill">manual GUI QA: {handoff?.manualGuiQaStatus ?? "not run"}</span>
        <span className="status-pill">handoff: {handoff?.status ?? "not generated"}</span>
        <span className="status-pill">
          result: {result?.exists ? (result.valid ? (result.status ?? "valid") : "needs attention") : "missing"}
        </span>
        <span className="status-pill">
          production: {handoff?.productionReady === true ? "ready" : "not ready"}
        </span>
      </div>
      {handoff !== undefined ? (
        <div className="details-grid" aria-label="Manual GUI QA handoff summary">
          <div>
            <span>Handoff manifest</span>
            <strong>{handoff.exists ? (handoff.valid ? "valid" : "needs attention") : "missing"}</strong>
          </div>
          <div>
            <span>Files</span>
            <strong>{handoff.fileCount ?? handoff.files?.length ?? "N/A"}</strong>
          </div>
          <div>
            <span>Unsigned draft</span>
            <strong>{handoff.unsignedDraft === true ? "yes" : "N/A"}</strong>
          </div>
          <div>
            <span>Raw logs excluded</span>
            <strong>{handoff.securityAssertions?.rawLogsExcluded === true ? "yes" : "N/A"}</strong>
          </div>
        </div>
      ) : null}
      {handoff?.reason !== undefined ? <p className="notice-text">{handoff.reason}</p> : null}
      {result !== undefined ? (
        <div className="details-grid" aria-label="Manual GUI QA result summary">
          <div>
            <span>Result manifest</span>
            <strong>{result.exists ? (result.valid ? "valid" : "needs attention") : "missing"}</strong>
          </div>
          <div>
            <span>Result status</span>
            <strong>{result.status ?? "N/A"}</strong>
          </div>
          <div>
            <span>Steps passed</span>
            <strong>
              {result.stepSummary === undefined
                ? "N/A"
                : `${result.stepSummary.passed}/${result.stepSummary.total}`}
            </strong>
          </div>
          <div>
            <span>Blocked / failed</span>
            <strong>
              {result.stepSummary === undefined
                ? "N/A"
                : `${result.stepSummary.blocked}/${result.stepSummary.failed}`}
            </strong>
          </div>
          <div>
            <span>Reviewer fields</span>
            <strong>
              {result.reviewer?.namePresent === true &&
              result.reviewer.completedAtPresent === true &&
              result.reviewer.environmentPresent === true
                ? "present"
                : "N/A"}
            </strong>
          </div>
          <div>
            <span>Production ready</span>
            <strong>{result.productionReady === true ? "yes" : "no"}</strong>
          </div>
        </div>
      ) : null}
      {result?.reason !== undefined ? <p className="notice-text">{result.reason}</p> : null}
      <p className="notice-text">
        A valid manual GUI QA result is still a QA artifact, not production release approval. Code signing,
        updater, installer approval, and release policy gates remain separate.
      </p>
      <ul>
        <li>
          Generate the automated evidence manifest with{" "}
          <code>pnpm verify:windows-packaging-qa-evidence</code>.
        </li>
        <li>
          Generate the reviewer template with{" "}
          <code>pnpm verify:windows-manual-gui-qa-template</code>.
        </li>
        <li>
          Fill the generated template only after completing{" "}
          <code>docs/windows-packaging-manual-gui-checklist.md</code> on an installed unsigned QA
          draft.
        </li>
        <li>
          Validate the filled reviewer result with{" "}
          <code>pnpm verify:windows-manual-gui-qa-result path/to/result.json</code>.
        </li>
        <li>
          Verify the aggregate evidence summary path with{" "}
          <code>pnpm smoke:windows-packaging-qa-evidence-manual-result</code>.
        </li>
        <li>Do not include tokens, full local paths, raw logs, command lines, or stack traces.</li>
      </ul>
      <p className="notice-text">
        The desktop UI does not run these commands directly, because packaged builds must not expose
        arbitrary shell execution to the frontend.
      </p>
    </section>
  );
}
