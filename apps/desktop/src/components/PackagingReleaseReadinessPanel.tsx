import type { PackagedStatusResponse } from "../api/types";

interface PackagingReleaseReadinessPanelProps {
  status: PackagedStatusResponse | null;
}

export function PackagingReleaseReadinessPanel({ status }: PackagingReleaseReadinessPanelProps) {
  const readiness = status?.releaseReadiness;

  return (
    <section className="panel" aria-label="Windows packaging release readiness">
      <h2>Release Readiness Gate</h2>
      <p className="notice-text">
        This gate is intentionally conservative. A passing smoke suite or manual QA result does not
        make the package production-ready until signing, updater policy, release approval, and other
        production gates are complete.
      </p>
      {readiness === undefined ? (
        <p>N/A</p>
      ) : (
        <>
          <div className="summary-row">
            <span className="status-pill">manifest: {readiness.exists ? "present" : "missing"}</span>
            <span className="status-pill">release: {readiness.releaseStatus ?? "unknown"}</span>
            <span className="status-pill">QA draft: {readiness.qaDraftStatus ?? "unknown"}</span>
            <span className="status-pill">
              production: {readiness.productionReady === true ? "ready" : "not ready"}
            </span>
          </div>
          {readiness.reason !== undefined ? <p className="notice-text">{readiness.reason}</p> : null}
          {readiness.blockers !== undefined && readiness.blockers.length > 0 ? (
            <ul>
              {readiness.blockers.map((blocker) => (
                <li key={blocker.code}>
                  <strong>{blocker.code}</strong>: {blocker.reason}
                </li>
              ))}
            </ul>
          ) : (
            <p className="notice-text">No blocker list is available.</p>
          )}
        </>
      )}
    </section>
  );
}
