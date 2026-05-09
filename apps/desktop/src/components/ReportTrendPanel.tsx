import { useMemo } from "react";
import type { DownsampledMetricBucket, MetricEvent } from "../api/types";
import { useI18n } from "../i18n/I18nProvider";
import { CHART_METRIC_NAMES } from "../utils/metricSeries";
import type { ReportMetricPreview } from "../utils/reportMetricPreview";
import {
  buildReportTrendSeriesFromBuckets,
  buildReportTrendSeriesFromRawMetrics,
  hasNumericTrendMetrics,
  REPORT_TREND_UNITS
} from "../utils/reportTrendSeries";
import { RealtimeMetricChart } from "./charts/RealtimeMetricChart";
import { EmptyState } from "./EmptyState";

export interface ReportTrendPanelProps {
  metrics: MetricEvent[];
  downsampledBuckets: DownsampledMetricBucket[];
  metricPreview: ReportMetricPreview;
}

export function ReportTrendPanel({ metrics, downsampledBuckets, metricPreview }: ReportTrendPanelProps) {
  const { t } = useI18n();
  const usesDownsampled = metricPreview.source === "downsampled" && downsampledBuckets.length > 0;
  const seriesState = useMemo(
    () =>
      usesDownsampled
        ? buildReportTrendSeriesFromBuckets(downsampledBuckets)
        : buildReportTrendSeriesFromRawMetrics(metrics),
    [downsampledBuckets, metrics, usesDownsampled]
  );
  const hasTrendData = usesDownsampled
    ? Object.values(seriesState).some((series) => series.length > 0)
    : hasNumericTrendMetrics(metrics);

  return (
    <section className="panel">
      <div className="chart-card__header">
        <div>
          <h2>{t("report.trendsTitle")}</h2>
          <p>
            {usesDownsampled
              ? t("report.downsampledPreview")
              : t("report.rawPreview")}
          </p>
        </div>
        <div className="summary-row">
          <span className="status-pill">
            {t("report.trendSource")}: {usesDownsampled ? "downsampled" : "raw"}
          </span>
          <span className="status-pill">
            {t("report.trendPoints")}: {metricPreview.sampleCount}
          </span>
        </div>
      </div>
      {hasTrendData ? (
        <div className="chart-grid">
          {CHART_METRIC_NAMES.map((metricName) => (
            <RealtimeMetricChart
              key={metricName}
              title={
                metricName === "fps"
                  ? t("metric.fps")
                  : metricName === "frame_time_ms"
                    ? t("metric.frameTime")
                    : metricName === "cpu_percent"
                      ? t("metric.cpu")
                      : metricName === "memory_mb"
                        ? t("metric.memory")
                        : metricName
              }
              unit={REPORT_TREND_UNITS[metricName]}
              series={seriesState[metricName] ?? []}
              maxPoints={usesDownsampled ? 10_000 : 500}
              showTooltip
              showLegend
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title={t("report.noTrendData")}
          message={t("report.noTrendDataMessage")}
        />
      )}
    </section>
  );
}
