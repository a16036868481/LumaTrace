import type { PackagedStatusResponse } from "../api/types";
import { summarizeLogRotation } from "../tauri/logRotationStatus";
import { SanitizedLogExcerpt } from "./SanitizedLogExcerpt";

interface LogRotationPanelProps {
  status: PackagedStatusResponse | null;
}

export function LogRotationPanel({ status }: LogRotationPanelProps) {
  const logs = status?.logs;
  return (
    <section className="panel" aria-label="Log rotation status">
      <h2>Log Rotation</h2>
      {logs === undefined ? (
        <p>N/A</p>
      ) : (
        <>
          <div className="summary-row">
            <span className="status-pill">max size: {logs.rotationPolicy.maxFileSizeBytes} bytes</span>
            <span className="status-pill">max files: {logs.rotationPolicy.maxFiles}</span>
            <span className="status-pill">startup: {logs.rotationPolicy.rotateOnStartup === false ? "off" : "on"}</span>
            <span className="status-pill">delete oldest: {logs.rotationPolicy.deleteOldest === false ? "off" : "on"}</span>
            <span className="status-pill">last rotation: {summarizeLogRotation(status)}</span>
          </div>
          <p className="notice-text">Raw logs are not copied into reports. Diagnostics export uses sanitized excerpts.</p>
          {logs.lastRotationResult?.warnings.length ? (
            <ul>
              {logs.lastRotationResult.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
          {logs.logFiles.length === 0 ? (
            <p>No log files yet.</p>
          ) : (
            <ul>
              {logs.logFiles.map((file) => (
                <li key={file.name}>
                  {file.name}: {file.sizeBytes} bytes{file.rotated ? " (rotated)" : ""}
                  {file.excerpt !== undefined ? <SanitizedLogExcerpt excerpt={file.excerpt} /> : null}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
