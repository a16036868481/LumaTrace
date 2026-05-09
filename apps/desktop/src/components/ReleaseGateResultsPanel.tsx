import type { PackagedStatusResponse } from "../api/types";

interface ReleaseGateResultsPanelProps {
  status: PackagedStatusResponse | null;
}

export function ReleaseGateResultsPanel({ status }: ReleaseGateResultsPanelProps) {
  const intake = status?.releaseGateResults;
  const importManifest = status?.releaseGateResultsImport;
  const suite = status?.releaseGateResultsSuite;

  return (
    <section className="panel" aria-label="Windows release gate results intake">
      <h2>Release Gate Results</h2>
      <p className="notice-text">
        This panel shows the sanitized intake for external release-gate result files. A valid result
        can remove only its matching blocker after the RC gate is refreshed; productionReady remains false.
      </p>
      {intake === undefined ? (
        <p>N/A</p>
      ) : (
        <>
          <div className="summary-row">
            <span className="status-pill">intake: {intake.exists ? "present" : "missing"}</span>
            <span className="status-pill">status: {intake.status ?? "unknown"}</span>
            <span className="status-pill">valid: {intake.valid ? "yes" : "no"}</span>
            <span className="status-pill">
              production: {intake.productionReady === true ? "ready" : "not ready"}
            </span>
          </div>
          {intake.reason !== undefined ? <p className="notice-text">{intake.reason}</p> : null}
          {intake.resultSummary !== undefined ? (
            <div className="details-grid" aria-label="Release gate result counts">
              <div>
                <span>Total</span>
                <strong>{intake.resultSummary.total}</strong>
              </div>
              <div>
                <span>Valid</span>
                <strong>{intake.resultSummary.valid}</strong>
              </div>
              <div>
                <span>Invalid</span>
                <strong>{intake.resultSummary.invalid}</strong>
              </div>
              <div>
                <span>Missing</span>
                <strong>{intake.resultSummary.missing}</strong>
              </div>
            </div>
          ) : null}
          {intake.results !== undefined && intake.results.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Gate</th>
                    <th>Status</th>
                    <th>Blocker</th>
                    <th>Result File</th>
                    <th>Verifier</th>
                  </tr>
                </thead>
                <tbody>
                  {intake.results.map((result) => (
                    <tr key={result.blockerCode}>
                      <td>{result.gate}</td>
                      <td>{result.status}</td>
                      <td>{result.blockerCode}</td>
                      <td>{result.resultFile}</td>
                      <td>{result.verifierCommand}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="notice-text">No release gate result entries are available.</p>
          )}
          {intake.nextCommands !== undefined && intake.nextCommands.length > 0 ? (
            <div>
              <h3>Next Commands</h3>
              <ul>
                {intake.nextCommands.map((command) => (
                  <li key={command}>{command}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div>
            <h3>Import Workflow</h3>
            {importManifest === undefined ? (
              <p className="notice-text">N/A</p>
            ) : (
              <>
                <div className="summary-row">
                  <span className="status-pill">import: {importManifest.exists ? "present" : "missing"}</span>
                  <span className="status-pill">status: {importManifest.status ?? "unknown"}</span>
                  <span className="status-pill">valid: {importManifest.valid ? "yes" : "no"}</span>
                  <span className="status-pill">dry run: {importManifest.dryRun === true ? "yes" : "no"}</span>
                </div>
                <p className="notice-text">
                  Import runs each dedicated verifier and copies only verifier-passing result files.
                  Invalid files are rejected and never become release evidence.
                </p>
                {importManifest.reason !== undefined ? <p className="notice-text">{importManifest.reason}</p> : null}
                {importManifest.importSummary !== undefined ? (
                  <div className="details-grid" aria-label="Release gate import counts">
                    <div>
                      <span>Total</span>
                      <strong>{importManifest.importSummary.total}</strong>
                    </div>
                    <div>
                      <span>Valid</span>
                      <strong>{importManifest.importSummary.valid}</strong>
                    </div>
                    <div>
                      <span>Invalid</span>
                      <strong>{importManifest.importSummary.invalid}</strong>
                    </div>
                    <div>
                      <span>Copied</span>
                      <strong>{importManifest.importSummary.copied}</strong>
                    </div>
                  </div>
                ) : null}
                {importManifest.refreshedIntake !== undefined ? (
                  <p className="notice-text">
                    Refreshed intake: {importManifest.refreshedIntake.status} (
                    {importManifest.refreshedIntake.validResults} valid,{" "}
                    {importManifest.refreshedIntake.invalidResults} invalid,{" "}
                    {importManifest.refreshedIntake.missingResults} missing)
                  </p>
                ) : null}
              </>
            )}
          </div>
          <div>
            <h3>Suite Smoke</h3>
            {suite === undefined ? (
              <p className="notice-text">N/A</p>
            ) : (
              <>
                <div className="summary-row">
                  <span className="status-pill">suite: {suite.exists ? "present" : "missing"}</span>
                  <span className="status-pill">status: {suite.status ?? "unknown"}</span>
                  <span className="status-pill">valid: {suite.valid ? "yes" : "no"}</span>
                  <span className="status-pill">
                    restored: {suite.restoredPreviousFiles === true ? "yes" : "N/A"}
                  </span>
                </div>
                <p className="notice-text">
                  The suite covers no-results, partial-results, invalid-results, and all-results-valid
                  intake states with sanitized synthetic evidence. It does not approve a release.
                </p>
                {suite.reason !== undefined ? <p className="notice-text">{suite.reason}</p> : null}
                {suite.caseSummary !== undefined ? (
                  <div className="details-grid" aria-label="Release gate suite case counts">
                    <div>
                      <span>Total</span>
                      <strong>{suite.caseSummary.total}</strong>
                    </div>
                    <div>
                      <span>Passed</span>
                      <strong>{suite.caseSummary.passed}</strong>
                    </div>
                    <div>
                      <span>Failed</span>
                      <strong>{suite.caseSummary.failed}</strong>
                    </div>
                    <div>
                      <span>Unknown</span>
                      <strong>{suite.caseSummary.unknown}</strong>
                    </div>
                  </div>
                ) : null}
                {suite.cases !== undefined && suite.cases.length > 0 ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Case</th>
                          <th>Status</th>
                          <th>Expected Intake</th>
                        </tr>
                      </thead>
                      <tbody>
                        {suite.cases.map((item) => (
                          <tr key={item.name}>
                            <td>{item.name}</td>
                            <td>{item.status}</td>
                            <td>{item.expectedIntakeStatus ?? "N/A"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
