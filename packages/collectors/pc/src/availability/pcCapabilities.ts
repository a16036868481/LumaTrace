import { METRIC_NAMES, type MetricAvailability } from "@lumatrace/core";

export interface PcCapabilityOptions {
  platform?: "windows" | "macos" | "linux";
  presentMonAvailable?: boolean;
}

export function getPcCapabilities(options: PcCapabilityOptions = {}): MetricAvailability[] {
  const platform = options.platform ?? "windows";
  const isWindows = platform === "windows";
  const presentMonAvailable = options.presentMonAvailable === true;
  const basicStatus = isWindows ? "available" : "unavailable";
  const basicReason = isWindows
    ? "PC Foundation supports local Windows process discovery and CPU/memory sampling."
    : "PC Foundation currently implements Windows sampling. macOS/Linux are planned.";
  const fpsStatus = presentMonAvailable ? "experimental" : "requires_tool";

  return [
    {
      metricName: "pc.device_discovery",
      platform,
      status: "available",
      reason: isWindows ? "Local PC device is discovered without external tools." : "Local host is visible, but platform sampling is planned.",
      source: "node:os"
    },
    {
      metricName: "pc.process_list",
      platform,
      status: basicStatus,
      reason: basicReason,
      suggestedAction: isWindows ? "Select an existing process target." : "Use Windows for PC process sampling.",
      source: "windows:process-list"
    },
    {
      metricName: METRIC_NAMES.CPU_PERCENT,
      platform,
      status: basicStatus,
      reason: isWindows
        ? "Calculated from process kernel/user time deltas over a sampling window. First sample is baseline only."
        : "Planned for later PC platform milestones.",
      source: "windows:process-times"
    },
    {
      metricName: METRIC_NAMES.MEMORY_MB,
      platform,
      status: basicStatus,
      reason: isWindows ? "Collected from process working set/private bytes snapshots." : "Planned for later PC platform milestones.",
      source: "windows:process-memory"
    },
    {
      metricName: METRIC_NAMES.FPS,
      platform,
      status: fpsStatus,
      reason: presentMonAvailable
        ? "PresentMon CSV capture can provide frame presentation metrics when target process matching succeeds. Capture is explicit and experimental."
        : "PresentMon is required for explicit PC FPS capture. CPU/memory sampling still works without it.",
      suggestedAction: presentMonAvailable
        ? "Enable PresentMon capture explicitly for a PC process session."
        : "Install PresentMon or configure LUMATRACE_PRESENTMON_PATH.",
      source: "PresentMon"
    },
    {
      metricName: METRIC_NAMES.FRAME_TIME_MS,
      platform,
      status: fpsStatus,
      reason: presentMonAvailable
        ? "PresentMon CSV capture can provide per-present frame-time fields when target process matching succeeds. Capture is explicit and experimental."
        : "PresentMon is required for explicit PC frame-time capture. Missing frame-time data is shown as N/A.",
      suggestedAction: presentMonAvailable
        ? "Enable PresentMon capture explicitly for a PC process session."
        : "Install PresentMon or configure LUMATRACE_PRESENTMON_PATH.",
      source: "PresentMon"
    },
    {
      metricName: "gpu_utilization",
      platform,
      status: "unavailable",
      reason: "GPU telemetry is outside Milestone 3B.",
      source: "planned"
    },
    {
      metricName: METRIC_NAMES.NETWORK_RX_BYTES,
      platform,
      status: "experimental",
      reason: "PC network sampling is planned and is not collected in Milestone 3B.",
      source: "planned"
    },
    {
      metricName: METRIC_NAMES.NETWORK_TX_BYTES,
      platform,
      status: "experimental",
      reason: "PC network sampling is planned and is not collected in Milestone 3B.",
      source: "planned"
    }
  ];
}
