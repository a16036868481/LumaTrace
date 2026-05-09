import type { PackagedStatusResponse } from "../api/types";
import { summarizePackagedStorage } from "../tauri/packagedStorageStatus";

interface PackagedStorageStatusPanelProps {
  status: PackagedStatusResponse | null;
}

export function PackagedStorageStatusPanel({ status }: PackagedStorageStatusPanelProps) {
  const storage = status?.storage;
  return (
    <section className="panel" aria-label="Packaged storage status">
      <h2>Packaged Storage</h2>
      <p className="notice-text">{summarizePackagedStorage(status)}</p>
      {storage === undefined ? (
        <p>N/A</p>
      ) : (
        <>
          <div className="summary-row">
            <span className="status-pill">db: {storage.dbExists ? "exists" : "missing"}</span>
            <span className="status-pill">migrations: {storage.migrationStatus}</span>
            <span className="status-pill">sessions: {storage.sessionsCount ?? "N/A"}</span>
            <span className="status-pill">reports: {storage.reportsCount ?? "N/A"}</span>
            <span className="status-pill">writable: {storage.writable === false ? "no" : "yes"}</span>
          </div>
          <dl className="detail-list">
            <div>
              <dt>DB</dt>
              <dd>{storage.dbPathSanitized ?? "N/A"}</dd>
            </div>
            <div>
              <dt>DB Size</dt>
              <dd>{storage.dbSizeBytes ?? "N/A"}</dd>
            </div>
            <div>
              <dt>Migration Versions</dt>
              <dd>{storage.migrationVersions?.join(", ") ?? "N/A"}</dd>
            </div>
            <div>
              <dt>Reports</dt>
              <dd>{storage.reportsDirSanitized ?? "N/A"}</dd>
            </div>
            <div>
              <dt>Diagnostics</dt>
              <dd>{storage.diagnosticsDirSanitized ?? "N/A"}</dd>
            </div>
          </dl>
          {storage.lastStorageErrorSanitized !== undefined ? (
            <p className="notice-text">{storage.lastStorageErrorSanitized}</p>
          ) : null}
        </>
      )}
    </section>
  );
}
