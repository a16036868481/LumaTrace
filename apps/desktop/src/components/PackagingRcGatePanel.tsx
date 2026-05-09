import type { PackagedStatusResponse } from "../api/types";

interface PackagingRcGatePanelProps {
  status: PackagedStatusResponse | null;
}

export function PackagingRcGatePanel({ status }: PackagingRcGatePanelProps) {
  const rcGate = status?.rcGate;
  const releasePolicy = status?.releasePolicy;

  return (
    <section className="panel" aria-label="Windows packaging RC gate">
      <h2>Windows RC Gate</h2>
      <p className="notice-text">
        RC status remains blocked until manual GUI QA, signing, updater policy, license review,
        sidecar production readiness, and production approval are complete.
      </p>
      {rcGate === undefined ? (
        <p>N/A</p>
      ) : (
        <>
          <div className="summary-row">
            <span className="status-pill">manifest: {rcGate.exists ? "present" : "missing"}</span>
            <span className="status-pill">RC: {rcGate.status ?? "unknown"}</span>
            <span className="status-pill">
              candidate: {rcGate.rcCandidateReady === true ? "ready" : "not ready"}
            </span>
            <span className="status-pill">
              production: {rcGate.productionReady === true ? "ready" : "not ready"}
            </span>
          </div>
          {rcGate.reason !== undefined ? <p className="notice-text">{rcGate.reason}</p> : null}
          {rcGate.gates !== undefined && rcGate.gates.length > 0 ? (
            <ul>
              {rcGate.gates.map((gate) => (
                <li key={gate.id}>
                  <strong>{gate.label}</strong>: {gate.status}
                  {gate.reason === undefined ? "" : ` - ${gate.reason}`}
                </li>
              ))}
            </ul>
          ) : (
            <p className="notice-text">No RC gate list is available.</p>
          )}
          {rcGate.blockers !== undefined && rcGate.blockers.length > 0 ? (
            <div>
              <h3>RC Blockers</h3>
              <ul>
                {rcGate.blockers.map((blocker) => (
                  <li key={blocker.code}>
                    <strong>{blocker.code}</strong>: {blocker.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div>
            <h3>Release Policy</h3>
            {releasePolicy === undefined ? (
              <p className="notice-text">Release policy template unavailable.</p>
            ) : (
              <>
                <div className="summary-row">
                  <span className="status-pill">
                    policy: {releasePolicy.status ?? "unknown"}
                  </span>
                  <span className="status-pill">
                    candidate: {releasePolicy.rcCandidateReady === true ? "ready" : "not ready"}
                  </span>
                  <span className="status-pill">
                    production: {releasePolicy.productionReady === true ? "ready" : "not ready"}
                  </span>
                </div>
                {releasePolicy.reason !== undefined ? (
                  <p className="notice-text">{releasePolicy.reason}</p>
                ) : null}
                {releasePolicy.blockers !== undefined && releasePolicy.blockers.length > 0 ? (
                  <ul>
                    {releasePolicy.blockers.map((blocker) => (
                      <li key={blocker.code}>
                        <strong>{blocker.code}</strong>: {blocker.reason}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="notice-text">No release policy blocker list is available.</p>
                )}
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
