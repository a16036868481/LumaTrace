import { useState } from "react";
import { captureIosXctrace, importIosTraceCsv } from "../api/endpoints";
import type { IosTraceImportResponse, IosXctraceCaptureResponse, Session, Target } from "../api/types";
import { normalizeApiError, type ApiError } from "../api/errors";
import { ApiErrorView } from "./ApiErrorView";

interface IosTraceImportPanelProps {
  session: Session | null;
  target: Target | undefined;
  onImported?: (result: IosTraceImportResponse | IosXctraceCaptureResponse) => void;
}

export function IosTraceImportPanel({ session, target, onImported }: IosTraceImportPanelProps) {
  const [csvText, setCsvText] = useState("");
  const [bundleId, setBundleId] = useState(target?.bundleId ?? "");
  const [processName, setProcessName] = useState(
    typeof target?.tags?.processName === "string" ? target.tags.processName : target?.name ?? ""
  );
  const [durationMs, setDurationMs] = useState(10_000);
  const [exportXPath, setExportXPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IosTraceImportResponse | null>(null);
  const [captureResult, setCaptureResult] = useState<IosXctraceCaptureResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  async function handleImport(): Promise<void> {
    if (session === null) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const imported = await importIosTraceCsv(session.id, {
        csvText,
        target: {
          ...(bundleId.length === 0 ? {} : { bundleId }),
          ...(processName.length === 0 ? {} : { processName })
        },
        captureId: `ios-manual-${Date.now()}`
      });
      setResult(imported);
      onImported?.(imported);
    } catch (caught) {
      setError(normalizeApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function handleAutomaticCapture(): Promise<void> {
    if (session === null) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const captured = await captureIosXctrace(session.id, {
        durationMs,
        target: {
          ...(bundleId.length === 0 ? {} : { bundleId }),
          ...(processName.length === 0 ? {} : { processName })
        },
        ...(exportXPath.trim().length === 0 ? {} : { exportXPath: exportXPath.trim() }),
        captureId: `ios-xctrace-${Date.now()}`
      });
      setCaptureResult(captured);
      onImported?.(captured);
    } catch (caught) {
      setError(normalizeApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-label="iOS trace import">
      <h2>iOS Trace Import</h2>
      <p className="notice-text">
        Paste a user-exported xctrace CSV. LumaTrace does not start xctrace recording, and no
        metrics are emitted when target matching fails or is ambiguous.
      </p>
      <div className="panel panel-subtle">
        <h3>Automatic xctrace capture</h3>
        <p className="notice-text">
          Experimental macOS/Xcode path. It records only after this button is clicked. Without a
          compatible export XPath, LumaTrace records the trace TOC and leaves metrics as N/A.
        </p>
        <div className="form-grid form-grid--wide">
          <label>
            Duration (ms)
            <input
              type="number"
              min={1000}
              max={120000}
              step={1000}
              value={durationMs}
              onChange={(event) => setDurationMs(Number(event.target.value))}
            />
          </label>
          <label>
            xctrace export XPath
            <input
              value={exportXPath}
              onChange={(event) => setExportXPath(event.target.value)}
              placeholder="/trace-toc/run/data/table"
            />
          </label>
        </div>
        <div className="summary-row">
          <button
            className="button"
            type="button"
            disabled={session === null || busy}
            onClick={() => void handleAutomaticCapture()}
          >
            {busy ? "Capturing..." : "Run automatic xctrace capture"}
          </button>
          <span className="status-pill">explicit action only</span>
          <span className="status-pill">raw trace excluded from diagnostics</span>
        </div>
        {captureResult !== null ? (
          <div className="panel panel-subtle">
            <p>
              status: {captureResult.status} | rows: {captureResult.rawRowCount} | matched:{" "}
              {captureResult.matchedRowCount} | metrics: {captureResult.metricCount}
            </p>
            <p>
              match: {captureResult.matchStatus ?? "N/A"} / {captureResult.matchConfidence ?? "N/A"}
            </p>
            <p>{captureResult.reason}</p>
            {captureResult.warnings.length > 0 ? (
              <ul>
                {captureResult.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
      {error !== null ? <ApiErrorView error={error} /> : null}
      <div className="form-grid form-grid--wide">
        <label>
          Bundle ID
          <input value={bundleId} onChange={(event) => setBundleId(event.target.value)} />
        </label>
        <label>
          Process Name
          <input value={processName} onChange={(event) => setProcessName(event.target.value)} />
        </label>
      </div>
      <label>
        xctrace CSV
        <textarea
          rows={7}
          value={csvText}
          onChange={(event) => setCsvText(event.target.value)}
          placeholder="Time (s),Process,Bundle Identifier,PID,FPS,Frame Time (ms)"
        />
      </label>
      <div className="summary-row">
        <button
          className="button"
          type="button"
          disabled={session === null || csvText.trim().length === 0 || busy}
          onClick={() => void handleImport()}
        >
          {busy ? "Importing..." : "Import iOS Trace CSV"}
        </button>
        <span className="status-pill">manual import only</span>
        <span className="status-pill">raw CSV excluded from diagnostics</span>
      </div>
      {result !== null ? (
        <div className="panel panel-subtle">
          <p>
            status: {result.status} | rows: {result.rawRowCount} | matched:{" "}
            {result.matchedRowCount} | metrics: {result.metricCount}
          </p>
          <p>
            match: {result.matchStatus} / {result.matchConfidence}
          </p>
          <p>{result.reason}</p>
          {result.warnings.length > 0 ? (
            <ul>
              {result.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
