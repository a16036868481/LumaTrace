import type { ReportSummary } from "../api/types";
import { MetricCard } from "./MetricCard";

export function SummaryGrid({ summary }: { summary: ReportSummary }) {
  return (
    <section className="metric-grid">
      <MetricCard title="Duration" value={summary.durationMs} unit="ms" />
      <MetricCard title="Avg FPS" value={summary.avgFps} unit="fps" />
      <MetricCard title="Min FPS" value={summary.minFps} unit="fps" />
      <MetricCard title="Max FPS" value={summary.maxFps} unit="fps" />
      <MetricCard title="1% Low" value={summary.onePercentLowFps} unit="fps" />
      <MetricCard title="0.1% Low" value={summary.zeroPointOnePercentLowFps} unit="fps" />
      <MetricCard title="P50 Frame Time" value={summary.p50FrameTimeMs} unit="ms" />
      <MetricCard title="P95 Frame Time" value={summary.p95FrameTimeMs} unit="ms" />
      <MetricCard title="P99 Frame Time" value={summary.p99FrameTimeMs} unit="ms" />
      <MetricCard title="Jank Count" value={summary.jankCount} unit="count" />
      <MetricCard title="Severe Jank" value={summary.severeJankCount} unit="count" />
      <MetricCard title="Avg CPU" value={summary.avgCpuPercent} unit="%" />
      <MetricCard title="Peak CPU" value={summary.peakCpuPercent} unit="%" />
      <MetricCard title="Avg Memory" value={summary.avgMemoryMb} unit="MB" />
      <MetricCard title="Peak Memory" value={summary.peakMemoryMb} unit="MB" />
      <MetricCard title="Network RX" value={summary.networkRxMb} unit="MB" />
      <MetricCard title="Network TX" value={summary.networkTxMb} unit="MB" />
      <MetricCard title="Battery Drain" value={summary.batteryDrainPercent} unit="%" />
      <MetricCard title="Thermal Events" value={summary.thermalEvents} unit="count" />
    </section>
  );
}
