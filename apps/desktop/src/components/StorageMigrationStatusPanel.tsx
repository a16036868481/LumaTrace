import type { PackagedStatusResponse } from "../api/types";

interface StorageMigrationStatusPanelProps {
  status: PackagedStatusResponse | null;
}

export function StorageMigrationStatusPanel({ status }: StorageMigrationStatusPanelProps) {
  const storage = status?.storage;
  return (
    <section className="panel" aria-label="Packaged storage status">
      <h2>Packaged Storage</h2>
      {storage === undefined ? (
        <p>N/A</p>
      ) : (
        <>
          <div className="summary-row">
            <span className="status-pill">db: {storage.dbExists ? "exists" : "missing"}</span>
            <span className="status-pill">migrations: {storage.migrationStatus}</span>
          </div>
          <dl className="detail-list">
            <div>
              <dt>DB</dt>
              <dd>{storage.dbPathSanitized ?? "N/A"}</dd>
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
        </>
      )}
    </section>
  );
}

