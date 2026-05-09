interface PresentMonCsvRetentionPanelProps {
  retentionMode: string;
  keepCsv: boolean;
}

export function PresentMonCsvRetentionPanel({ retentionMode, keepCsv }: PresentMonCsvRetentionPanelProps) {
  return (
    <div className="panel" aria-label="PresentMon CSV retention">
      <h2>PresentMon CSV Retention</h2>
      <div className="summary-row">
        <span className="status-pill">mode: {retentionMode}</span>
        <span className="status-pill">keep CSV: {keepCsv ? "yes" : "no"}</span>
      </div>
      <p className="notice-text">
        Reports never include raw PresentMon CSV content. Local paths are sanitized before they are
        shown in diagnostics or reports.
      </p>
    </div>
  );
}
