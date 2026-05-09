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

  avgMemoryMb?: number;
  peakMemoryMb?: number;

  networkRxMb?: number;
  networkTxMb?: number;

  batteryDrainPercent?: number;
  thermalEvents?: number;
}
