interface PackagingDiagnosticsPreviewProps {
  diagnostics: string | null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && !Array.isArray(value) && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function parseDiagnostics(text: string): Record<string, unknown> | null {
  try {
    return readRecord(JSON.parse(text));
  } catch {
    return null;
  }
}

export function PackagingDiagnosticsPreview({ diagnostics }: PackagingDiagnosticsPreviewProps) {
  if (diagnostics === null) {
    return <p>N/A</p>;
  }

  const parsed = parseDiagnostics(diagnostics);
  const releaseReadiness = readRecord(parsed?.releaseReadiness);
  const blockers = Array.isArray(releaseReadiness?.blockers) ? releaseReadiness.blockers : [];

  return (
    <>
      {releaseReadiness !== null ? (
        <div className="summary-row" aria-label="Packaging release readiness summary">
          <span className="status-pill">release: {String(releaseReadiness.releaseStatus ?? "unknown")}</span>
          <span className="status-pill">QA draft: {String(releaseReadiness.qaDraftStatus ?? "unknown")}</span>
          <span className="status-pill">
            blockers: {String(blockers.length)}
          </span>
        </div>
      ) : null}
      <pre className="code-block">{diagnostics}</pre>
    </>
  );
}
