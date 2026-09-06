import { useI18n } from "../i18n/I18nProvider";

export function PcSourcePrecisionNotice() {
  const { t } = useI18n();
  return (
    <div className="panel" role="note" aria-label={t("metricQuality.aria")}>
      <p>{t("pc.sourcePrecision")}</p>
    </div>
  );
}
