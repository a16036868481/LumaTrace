import type { ExportFormat } from "../api/types";
import { useI18n } from "../i18n/I18nProvider";

export function ExportButtons({ onExport }: { onExport: (format: ExportFormat) => void }) {
  const { t } = useI18n();
  return (
    <div className="summary-row">
      <button className="button button-secondary" type="button" onClick={() => onExport("json")}>
        {t("report.exportJson")}
      </button>
      <button className="button button-secondary" type="button" onClick={() => onExport("csv")}>
        {t("report.exportCsv")}
      </button>
      <button className="button button-secondary" type="button" onClick={() => onExport("html")}>
        {t("report.exportHtml")}
      </button>
    </div>
  );
}
