import type { DiagnosticRecord } from "../api/types";
import { formatTimestamp } from "../utils/format";
import { EmptyState } from "./EmptyState";
import { JsonPreview } from "./JsonPreview";

export interface DiagnosticsTimelineProps {
  diagnostics: DiagnosticRecord[];
  title?: string;
}

export function DiagnosticsTimeline({ diagnostics, title = "Diagnostics Timeline" }: DiagnosticsTimelineProps) {
  if (diagnostics.length === 0) {
    return <EmptyState title="No diagnostics" message="Warnings, fallbacks, and lifecycle events will appear here." />;
  }

  return (
    <section className="diagnostics-timeline" aria-label={title}>
      <h2>{title}</h2>
      <div className="diagnostic-list">
        {diagnostics.map((record) => (
          <article key={record.id} className={`diagnostic-item diagnostic-item--${record.level}`}>
            <div>
              <strong>{record.level}</strong> | {record.category} | {formatTimestamp(record.timestampMs)}
            </div>
            <p>{record.message}</p>
            {record.details !== undefined ? <JsonPreview value={record.details} /> : null}
          </article>
        ))}
      </div>
    </section>
  );
}
