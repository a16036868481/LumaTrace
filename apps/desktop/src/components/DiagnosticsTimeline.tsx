import type { DiagnosticRecord } from "../api/types";
import { useI18n } from "../i18n/I18nProvider";
import { formatTimestamp } from "../utils/format";
import { EmptyState } from "./EmptyState";
import { JsonPreview } from "./JsonPreview";

export interface DiagnosticsTimelineProps {
  diagnostics: DiagnosticRecord[];
  title?: string;
}

export function DiagnosticsTimeline({ diagnostics, title }: DiagnosticsTimelineProps) {
  const { t } = useI18n();
  const resolvedTitle = title ?? t("tools.diagnostics");
  if (diagnostics.length === 0) {
    return <EmptyState title={t("tools.noDiagnostics")} message={t("tools.noDiagnosticsMessage")} />;
  }

  return (
    <section className="diagnostics-timeline" aria-label={resolvedTitle}>
      <h2>{resolvedTitle}</h2>
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
