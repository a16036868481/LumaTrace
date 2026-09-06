export interface ReportSummary {
  durationMs: number;

  avgFps?: number;
  minFps?: number;
  maxFps?: number;
  onePercentLowFps?: number;
  zeroPointOnePercentLowFps?: number;

  p50FrameTimeMs?: number;
  p90FrameTimeMs?: number;
  p95FrameTimeMs?: number;
  p99FrameTimeMs?: number;

  jankCount?: number;
  severeJankCount?: number;

  avgCpuPercent?: number;
  peakCpuPercent?: number;

  avgGpuPercent?: number;
  peakGpuPercent?: number;

  avgMemoryMb?: number;
  peakMemoryMb?: number;

  avgPowerW?: number;
  peakPowerW?: number;

  avgCpuTemperatureC?: number;
  peakCpuTemperatureC?: number;

  avgGpuTemperatureC?: number;
  peakGpuTemperatureC?: number;

  /** Legacy ambiguous temperature fields retained for old stored reports. */
  avgTemperatureC?: number;
  peakTemperatureC?: number;

  networkRxMb?: number;
  networkTxMb?: number;

  batteryDrainPercent?: number;
  thermalEvents?: number;
}
