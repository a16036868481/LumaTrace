export const METRIC_NAMES = {
  FPS: "fps",
  FRAME_TIME_MS: "frame_time_ms",
  CPU_PERCENT: "cpu_percent",
  MEMORY_MB: "memory_mb",
  NETWORK_RX_BYTES: "network_rx_bytes",
  NETWORK_TX_BYTES: "network_tx_bytes",
  NETWORK_RX_RATE_BPS: "network_rx_rate_bps",
  NETWORK_TX_RATE_BPS: "network_tx_rate_bps",
  NETWORK_RX_BYTES_PER_SEC: "network_rx_bytes_per_sec",
  NETWORK_TX_BYTES_PER_SEC: "network_tx_bytes_per_sec",
  BATTERY_LEVEL_PERCENT: "battery_level_percent",
  BATTERY_CURRENT_MA: "battery_current_ma",
  BATTERY_VOLTAGE_MV: "battery_voltage_mv",
  BATTERY_TEMPERATURE_C: "battery_temperature_c",
  THERMAL_EVENT: "thermal_event"
} as const;

export type MetricName = (typeof METRIC_NAMES)[keyof typeof METRIC_NAMES];
