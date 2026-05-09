export const METRIC_UNITS = {
  FPS: "fps",
  MILLISECONDS: "ms",
  PERCENT: "%",
  MEGABYTES: "MB",
  BYTES: "bytes",
  BYTES_PER_SECOND: "B/s",
  MILLIAMPS: "mA",
  MILLIVOLTS: "mV",
  CELSIUS: "C",
  COUNT: "count"
} as const;

export type MetricUnit = (typeof METRIC_UNITS)[keyof typeof METRIC_UNITS];
