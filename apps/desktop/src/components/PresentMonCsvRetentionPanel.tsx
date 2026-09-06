import { useI18n } from "../i18n/I18nProvider";

interface PresentMonCsvRetentionPanelProps {
  retentionMode: string;
  keepCsv: boolean;
}

export function PresentMonCsvRetentionPanel({ retentionMode, keepCsv }: PresentMonCsvRetentionPanelProps) {
  const { t } = useI18n();
  return (
    <div className="panel" aria-label={t("presentMon.retentionTitle")}>
      <h2>{t("presentMon.retentionTitle")}</h2>
      <div className="summary-row">
        <span className="status-pill">{t("presentMon.retentionMode")}: {retentionMode}</span>
        <span className="status-pill">{t("presentMon.keepCsv")}: {keepCsv ? t("common.yes") : t("common.no")}</span>
      </div>
      <p className="notice-text">{t("presentMon.retentionBody")}</p>
    </div>
  );
}
