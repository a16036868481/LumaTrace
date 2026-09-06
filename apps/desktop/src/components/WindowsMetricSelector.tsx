import type { MetricAvailabilityStatus } from "@lumatrace/core";
import { useI18n } from "../i18n/I18nProvider";
import type { TranslationKey } from "../i18n/translations";

export const WINDOWS_TEST_METRICS = [
  "fps",
  "cpu",
  "gpu",
  "memory",
  "power",
  "gpuTemperature"
] as const;

export type WindowsTestMetric = (typeof WINDOWS_TEST_METRICS)[number];

export type WindowsMetricSelection = Record<WindowsTestMetric, boolean>;
export type WindowsMetricAvailability = Record<WindowsTestMetric, MetricAvailabilityStatus>;

const labelKeys = {
  fps: "metric.fps",
  cpu: "metric.cpu",
  gpu: "metric.gpu",
  memory: "metric.memory",
  power: "metric.power",
  gpuTemperature: "metric.gpuTemperature"
} as const;

const availabilityKeys = {
  available: "availability.available",
  unavailable: "availability.unavailable",
  requires_tool: "availability.requires_tool",
  requires_permission: "availability.requires_permission",
  experimental: "availability.experimental"
} as const;

export const DEFAULT_WINDOWS_METRIC_SELECTION: WindowsMetricSelection = {
  fps: true,
  cpu: true,
  gpu: true,
  memory: true,
  power: true,
  gpuTemperature: true
};

export interface MetricSelectorOption<Metric extends string> {
  key: Metric;
  labelKey: TranslationKey;
  availability: MetricAvailabilityStatus;
}

interface MetricSelectorProps<Metric extends string> {
  options: readonly MetricSelectorOption<Metric>[];
  value: Record<Metric, boolean>;
  onChange: (metric: Metric, enabled: boolean) => void;
}

export function MetricSelector<Metric extends string>({
  options,
  value,
  onChange
}: MetricSelectorProps<Metric>) {
  const { t } = useI18n();

  return (
    <section className="windows-metric-selector" aria-label={t("common.metrics")}>
      <strong className="windows-metric-selector__title">{t("common.metrics")}</strong>
      <div className="windows-metric-selector__options" data-columns={Math.min(options.length, 6)}>
        {options.map((option) => {
          const status = option.availability;
          const showStatus = status !== "available" && status !== "experimental";
          const accessibleLabel = showStatus
            ? `${t(option.labelKey)} ${t(availabilityKeys[status])}`
            : t(option.labelKey);
          return (
            <label
              key={option.key}
              className={`windows-metric-option${value[option.key] ? " is-selected" : ""}${showStatus ? " has-status" : ""}`}
            >
              <input
                aria-label={accessibleLabel}
                checked={value[option.key]}
                type="checkbox"
                onChange={(event) => onChange(option.key, event.target.checked)}
              />
              <span className="windows-metric-option__label">{t(option.labelKey)}</span>
              {showStatus ? (
                <span className={`windows-metric-option__status is-${status}`}>
                  {t(availabilityKeys[status])}
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
    </section>
  );
}

interface WindowsMetricSelectorProps {
  availability: WindowsMetricAvailability;
  value: WindowsMetricSelection;
  onChange: (metric: WindowsTestMetric, enabled: boolean) => void;
}

export function WindowsMetricSelector({
  availability,
  value,
  onChange
}: WindowsMetricSelectorProps) {
  const options = WINDOWS_TEST_METRICS.map((metric) => ({
    key: metric,
    labelKey: labelKeys[metric],
    availability: availability[metric]
  }));

  return <MetricSelector options={options} value={value} onChange={onChange} />;
}
