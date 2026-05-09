import type { PresentMonCaptureStatusResponse } from "../api/types";
import { EmptyState } from "./EmptyState";

interface PresentMonCaptureStatusPanelProps {
  status: PresentMonCaptureStatusResponse | null;
}

export function PresentMonCaptureStatusPanel({ status }: PresentMonCaptureStatusPanelProps) {
  if (status === null) {
    return <EmptyState title="No PresentMon status" message="Create or start a PC session to see capture status." />;
  }

  return (
    <section className="panel" aria-label="PresentMon capture status">
      <h2>PresentMon Capture Status</h2>
      <div className="summary-row">
        <span className="status-pill">status: {status.status}</span>
        <span className="status-pill">progress: {status.progressPercent ?? 0}%</span>
        <span className="status-pill">raw rows: {status.rawRowCount ?? "N/A"}</span>
        <span className="status-pill">matched rows: {status.matchedRowCount ?? "N/A"}</span>
        <span className="status-pill">metrics: {status.metricCount ?? "N/A"}</span>
      </div>
      <p className="notice-text">
        {status.reason ??
          "PresentMon capture is explicit, experimental, and only emits FPS when target matching succeeds."}
      </p>
      {status.outputFilePathSanitized !== undefined ? (
        <p className="notice-text">CSV path: {status.outputFilePathSanitized}</p>
      ) : null}
      {status.warnings.length > 0 ? (
        <ul>
          {status.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
