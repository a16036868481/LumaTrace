import { METRIC_NAMES, type MetricAvailability } from "@lumatrace/core";

export function buildAndroidFpsAvailability(): MetricAvailability[] {
  return [
    {
      metricName: METRIC_NAMES.FPS,
      platform: "android",
      status: "experimental",
      reason:
        "Android FPS is an experimental stop-time probe using gfxinfo framestats and SurfaceFlinger timestats. Layer matching can fail or be ambiguous.",
      suggestedAction:
        "Enable only for investigation. Treat missing or ambiguous FPS as unavailable rather than estimated.",
      source: "adb:gfxinfo/surfaceflinger"
    },
    {
      metricName: METRIC_NAMES.FRAME_TIME_MS,
      platform: "android",
      status: "experimental",
      reason:
        "Android frame time is emitted only when real frame timing samples are parsed. It is not inferred from average FPS.",
      suggestedAction:
        "Do not interpret missing frame_time_ms as zero. Check diagnostics for parser and layer matching warnings.",
      source: "adb:gfxinfo/surfaceflinger"
    }
  ];
}
