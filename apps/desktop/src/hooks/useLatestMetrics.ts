import { useMemo } from "react";
import type { MetricEvent } from "../api/types";
import { getLatestMetricByName } from "../utils/metricSeries";

export function useLatestMetrics(metrics: MetricEvent[]) {
  return useMemo(
    () => ({
      fps: getLatestMetricByName(metrics, "fps"),
      frameTime: getLatestMetricByName(metrics, "frame_time_ms"),
      cpu: getLatestMetricByName(metrics, "cpu_percent"),
      memory: getLatestMetricByName(metrics, "memory_mb"),
      batteryLevel: getLatestMetricByName(metrics, "battery_level_percent"),
      batteryTemperature: getLatestMetricByName(metrics, "battery_temperature_c"),
      batteryVoltage: getLatestMetricByName(metrics, "battery_voltage_mv"),
      batteryCurrent: getLatestMetricByName(metrics, "battery_current_ma"),
      networkRx: getLatestMetricByName(metrics, "network_rx_bytes"),
      networkTx: getLatestMetricByName(metrics, "network_tx_bytes"),
      networkRxRate: getLatestMetricByName(metrics, "network_rx_rate_bps"),
      networkTxRate: getLatestMetricByName(metrics, "network_tx_rate_bps")
    }),
    [metrics]
  );
}
