import { useMemo } from "react";
import type { MetricSeriesPoint } from "../../utils/metricSeries";
import { formatMetricValue, formatTimestamp } from "../../utils/format";
import { useI18n } from "../../i18n/I18nProvider";

export interface RealtimeMetricChartProps {
  title: string;
  unit: string;
  series: MetricSeriesPoint[];
  maxPoints?: number;
  yAxisFormatter?: (value: number) => string;
  valueFormatter?: (value: number | null, unit: string) => string;
  height?: number;
  paused?: boolean;
  showTooltip?: boolean;
  showLegend?: boolean;
}

interface ScaledPoint extends MetricSeriesPoint {
  x: number;
  y: number | null;
}

function splitPathSegments(points: ScaledPoint[]): string[] {
  const segments: string[] = [];
  let current: string[] = [];
  for (const point of points) {
    if (point.y === null) {
      if (current.length > 1) {
        segments.push(current.join(" "));
      }
      current = [];
      continue;
    }
    current.push(`${current.length === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`);
  }
  if (current.length > 1) {
    segments.push(current.join(" "));
  }
  return segments;
}

export function RealtimeMetricChart({
  title,
  unit,
  series,
  maxPoints = 300,
  yAxisFormatter,
  valueFormatter = formatMetricValue,
  height = 180,
  paused = false,
  showTooltip = true,
  showLegend = true
}: RealtimeMetricChartProps) {
  const { t } = useI18n();
  const visibleSeries = useMemo(() => series.slice(-maxPoints), [maxPoints, series]);
  const numericValues = visibleSeries
    .map((point) => point.value)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const hasMock = visibleSeries.some((point) => point.source === "mock");
  const hasData = numericValues.length > 0;
  const minValue = hasData ? Math.min(...numericValues) : 0;
  const maxValue = hasData ? Math.max(...numericValues) : 1;
  const padding = 18;
  const width = 640;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const range = maxValue - minValue || 1;
  const scaledPoints: ScaledPoint[] = visibleSeries.map((point, index) => ({
    ...point,
    x: padding + (visibleSeries.length <= 1 ? 0 : (index / (visibleSeries.length - 1)) * innerWidth),
    y:
      point.value === null
        ? null
        : padding + innerHeight - ((point.value - minValue) / range) * innerHeight
  }));
  const segments = splitPathSegments(scaledPoints);
  const latest = visibleSeries.at(-1);

  return (
    <section className="chart-card" aria-label={title}>
      <div className="chart-card__header">
        <div>
          <h3>{title}</h3>
          <p>{latest !== undefined ? valueFormatter(latest.value, unit) : t("common.na")}</p>
        </div>
        <div className="summary-row">
          {hasMock ? <span className="status-pill">{t("common.source")}: mock</span> : null}
          {paused ? <span className="status-pill">{t("common.paused")}</span> : null}
        </div>
      </div>
      <svg className="realtime-chart" role="img" aria-label={title} viewBox={`0 0 ${width} ${height}`}>
        <title>{title}</title>
        <line x1={padding} x2={width - padding} y1={height - padding} y2={height - padding} />
        <line x1={padding} x2={padding} y1={padding} y2={height - padding} />
        {hasData ? (
          <>
            <text x={padding + 4} y={padding + 10}>
              {yAxisFormatter?.(maxValue) ?? valueFormatter(maxValue, unit)}
            </text>
            <text x={padding + 4} y={height - padding - 4}>
              {yAxisFormatter?.(minValue) ?? valueFormatter(minValue, unit)}
            </text>
          </>
        ) : (
          <text x={width / 2} y={height / 2} textAnchor="middle">
            {t("common.na")}
          </text>
        )}
        {segments.map((segment, index) => (
          <path key={`${title}-${index}`} d={segment} />
        ))}
        {scaledPoints.map((point, index) =>
          point.y === null ? null : (
            <circle key={`${point.timestampMs}-${index}`} cx={point.x} cy={point.y} r="3">
              {showTooltip ? (
                <title>
                  {`${formatTimestamp(point.timestampMs)}
${t("common.value")}: ${valueFormatter(point.value, unit)}
${t("common.source")}: ${point.source ?? t("common.na")}
${t("common.precision")}: ${point.precision ?? t("common.na")}
${t("common.confidence")}: ${point.confidence ?? t("common.na")}`}
                </title>
              ) : null}
            </circle>
          )
        )}
      </svg>
      {showLegend ? (
        <div className="chart-card__legend">
          <span>{t("chart.points")}: {visibleSeries.length}</span>
          <span>{t("chart.nullsNotZero")}</span>
        </div>
      ) : null}
    </section>
  );
}
