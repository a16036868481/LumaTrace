import { useState } from "react";
import { exportSessionDiagnostics } from "../api/endpoints";
import { normalizeApiError, type ApiError } from "../api/errors";
import { downloadTextFile } from "../utils/download";
import { ApiErrorView } from "./ApiErrorView";

export interface DiagnosticsExportButtonProps {
  sessionId: string;
}

export function DiagnosticsExportButton({ sessionId }: DiagnosticsExportButtonProps) {
  const [error, setError] = useState<ApiError | null>(null);

  async function handleExport(format: "json" | "html"): Promise<void> {
    setError(null);
    try {
      const body = await exportSessionDiagnostics(sessionId, format);
      downloadTextFile(body, format, `${sessionId}-diagnostics`);
    } catch (caught) {
      setError(normalizeApiError(caught));
    }
  }

  return (
    <div>
      {error !== null ? <ApiErrorView error={error} /> : null}
      <div className="summary-row">
        <button className="button button-secondary" type="button" onClick={() => void handleExport("json")}>
          Export diagnostics JSON
        </button>
        <button className="button button-secondary" type="button" onClick={() => void handleExport("html")}>
          Export diagnostics HTML
        </button>
      </div>
    </div>
  );
}
