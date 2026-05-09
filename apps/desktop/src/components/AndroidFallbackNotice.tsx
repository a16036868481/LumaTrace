import type { MetricEvent } from "../api/types";

export interface AndroidFallbackNoticeProps {
  metrics?: MetricEvent[];
  diagnostics?: Array<{ message: string; category: string }>;
}

export function AndroidFallbackNotice({ metrics = [], diagnostics = [] }: AndroidFallbackNoticeProps) {
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
    <div className="notice-stack" aria-label="Android fallback notices">
      {deviceLevelNetwork ? (
        <p className="notice-text">Device-level network counters may include traffic from other apps.</p>
      ) : null}
      {meminfoFallback ? (
        <p className="notice-text">Memory fell back to /proc/&lt;pid&gt;/status with lower confidence.</p>
      ) : null}
      {fpsDiagnostic ? <p className="notice-text">Android FPS probe is experimental.</p> : null}
    </div>
  );
}
