import type { MetricEvent } from "../api/types";
import { useI18n } from "../i18n/I18nProvider";

export interface AndroidFallbackNoticeProps {
  metrics?: MetricEvent[];
  diagnostics?: Array<{ message: string; category: string }>;
}

export function AndroidFallbackNotice({ metrics = [], diagnostics = [] }: AndroidFallbackNoticeProps) {
  const { t } = useI18n();
  const deviceLevelNetwork = metrics.some(
    (metric) => metric.metricName.startsWith("network_") && metric.precision === "device_level"
  );
  const meminfoFallback = metrics.some(
    (metric) => metric.metricName === "memory_mb" && metric.tags?.fallback === true
  );
  const fpsDiagnostic = diagnostics.some(
    (diagnostic) => diagnostic.category === "fps" || /fps/i.test(diagnostic.message)
  );

  if (!deviceLevelNetwork && !meminfoFallback && !fpsDiagnostic) {
    return null;
  }

  return (
    <div className="notice-stack" aria-label={t("session.androidNetworkNotice")}>
      {deviceLevelNetwork ? (
        <p className="notice-text">{t("android.fallbackNetwork")}</p>
      ) : null}
      {meminfoFallback ? (
        <p className="notice-text">{t("android.fallbackMemory")}</p>
      ) : null}
      {fpsDiagnostic ? <p className="notice-text">{t("android.fpsExperimental")}</p> : null}
    </div>
  );
}
