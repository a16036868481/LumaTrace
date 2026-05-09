export const DEFAULT_CHART_MAX_POINTS = 300;

export const CHART_COLORS: Record<string, string> = {
  fps: "#1769aa",
  frame_time_ms: "#8b5cf6",
  cpu_percent: "#c2410c",
  memory_mb: "#1f7a4d"
};

export function metricLabel(metricName: string): string {
  if (metricName === "fps") {
    return "FPS";
  }
  if (metricName === "frame_time_ms") {
    return "Frame Time";
  }
  if (metricName === "cpu_percent") {
    return "CPU";
  }
  if (metricName === "memory_mb") {
    return "Memory";
  }
  return metricName;
}
