import type { PackagedStatusResponse } from "../api/types";

interface ReleaseResultWorkspacePanelProps {
  status: PackagedStatusResponse | null;
}

export function ReleaseResultWorkspacePanel({ status }: ReleaseResultWorkspacePanelProps) {
  const workspace = status?.releaseResultWorkspace;

  return (
    <section className="panel" aria-label="Windows release result workspace">
      <h2>Release Result Workspace</h2>
      <p className="notice-text">
        This workspace helps reviewers prepare real release-gate result files. The generated drafts
        are deliberately not valid release results, cannot remove blockers, and keep productionReady false.
      </p>
      {workspace === undefined ? (
        <p>N/A</p>
      ) : (
        <>
          <div className="summary-row">
            <span className="status-pill">workspace: {workspace.exists ? "present" : "missing"}</span>
            <span className="status-pill">status: {workspace.status ?? "unknown"}</span>
            <span className="status-pill">valid: {workspace.valid ? "yes" : "no"}</span>
            <span className="status-pill">
              production: {workspace.productionReady === true ? "ready" : "not ready"}
            </span>
          </div>
          {workspace.reason !== undefined ? <p className="notice-text">{workspace.reason}</p> : null}
          <div className="details-grid" aria-label="Release result workspace summary">
            <div>
              <span>Gates</span>
              <strong>{workspace.gateSummary?.total ?? "N/A"}</strong>
            </div>
            <div>
              <span>Human review</span>
              <strong>{workspace.gateSummary?.requiresHumanReview ?? "N/A"}</strong>
            </div>
            <div>
              <span>Drafts</span>
              <strong>{workspace.draftSummary?.total ?? "N/A"}</strong>
            </div>
            <div>
              <span>Cannot remove blockers</span>
              <strong>
                {workspace.draftSummary === undefined
                  ? "N/A"
                  : `${workspace.draftSummary.cannotRemoveBlockers}/${workspace.draftSummary.total}`}
              </strong>
            </div>
            <div>
              <span>Templates</span>
              <strong>{workspace.fileSummary?.templates ?? "N/A"}</strong>
            </div>
            <div>
              <span>Current intake</span>
              <strong>{workspace.currentIntake?.status ?? "N/A"}</strong>
            </div>
          </div>
          {workspace.gateActions !== undefined && workspace.gateActions.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Gate</th>
                    <th>Blocker</th>
                    <th>Draft</th>
                    <th>Expected Result</th>
                    <th>Verifier</th>
                  </tr>
                </thead>
                <tbody>
                  {workspace.gateActions.map((action) => {
                    const draft = workspace.drafts?.find((entry) => entry.blockerCode === action.blockerCode);
                    return (
                      <tr key={action.blockerCode}>
                        <td>{action.gate}</td>
                        <td>{action.blockerCode}</td>
                        <td>{draft?.draftFile ?? "N/A"}</td>
                        <td>{action.resultFile}</td>
                        <td>{action.verifierCommand}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="notice-text">No release result workspace gate actions are available.</p>
          )}
          {workspace.instructions !== undefined && workspace.instructions.length > 0 ? (
            <div>
              <h3>Workspace Instructions</h3>
              <ul>
                {workspace.instructions.map((instruction) => (
                  <li key={instruction}>{instruction}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="notice-text">
            Use <code>pnpm verify:windows-release-result-workspace</code> to refresh this reviewer aid.
            Final result files must still pass their dedicated verifiers before the release gate intake can
            remove blockers.
          </p>
        </>
      )}
    </section>
  );
}
