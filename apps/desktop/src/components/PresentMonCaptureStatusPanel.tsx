import type { PresentMonCaptureStatusResponse } from "../api/types";
import { EmptyState } from "./EmptyState";
import { useI18n } from "../i18n/I18nProvider";

interface PresentMonCaptureStatusPanelProps {
  status: PresentMonCaptureStatusResponse | null;
}

export function PresentMonCaptureStatusPanel({ status }: PresentMonCaptureStatusPanelProps) {
  const { t } = useI18n();
  if (status === null) {
    return <EmptyState title={t("presentMon.noStatus")} message={t("presentMon.noStatusBody")} />;
  }

  return (
    <section className="panel" aria-label={t("presentMon.captureStatus")}>
      <h2>{t("presentMon.captureStatus")}</h2>
      <div className="summary-row">
        <span className="status-pill">{t("common.status")}: {status.status}</span>
        <span className="status-pill">{t("presentMon.progress")}: {status.progressPercent ?? 0}%</span>
        <span className="status-pill">{t("presentMon.rawRows")}: {status.rawRowCount ?? t("common.na")}</span>
        <span className="status-pill">{t("presentMon.matchedRows")}: {status.matchedRowCount ?? t("common.na")}</span>
        <span className="status-pill">{t("common.metrics")}: {status.metricCount ?? t("common.na")}</span>
      </div>
      <p className="notice-text">
        {status.reason ??
          t("presentMon.defaultReason")}
      </p>
      {status.outputFilePathSanitized !== undefined ? (
        <p className="notice-text">{t("presentMon.csvPath")}: {status.outputFilePathSanitized}</p>
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
