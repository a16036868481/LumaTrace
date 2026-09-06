import { METRIC_NAMES, type MetricAvailability } from "@lumatrace/core";

export interface PcCapabilityOptions {
  platform?: "windows" | "macos" | "linux";
  presentMonAvailable?: boolean;
  processGpuAvailable?: boolean;
  processGpuSource?: string;
  powerAvailable?: boolean;
  powerSource?: string;
  cpuTemperatureAvailable?: boolean;
  cpuTemperatureSource?: string;
  gpuTemperatureAvailable?: boolean;
  gpuTemperatureSource?: string;
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
  const processGpuAvailable = isWindows && options.processGpuAvailable === true;
  const powerAvailable = isWindows && options.powerAvailable === true;
  const gpuTemperatureAvailable = isWindows && options.gpuTemperatureAvailable === true;

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
      metricName: METRIC_NAMES.GPU_UTILIZATION,
      platform,
      status: processGpuAvailable ? "available" : "unavailable",
      reason: processGpuAvailable
        ? "Collected for the selected process from Windows GPU Engine counters using the busiest-engine value."
        : "Windows GPU Engine performance counters did not return a usable process-level source.",
      ...(processGpuAvailable
        ? {}
        : {
            suggestedAction:
              "Update the graphics driver and confirm Windows GPU performance counters are available."
          }),
      source: options.processGpuSource ?? "windows:cim-gpu-engine"
    },
    {
      metricName: METRIC_NAMES.POWER_W,
      platform,
      status: powerAvailable ? "available" : "requires_tool",
      reason: powerAvailable
        ? "Collected from the GPU driver's board-power sensor. This is device-level GPU power, not per-process power."
        : "No supported GPU driver power sensor returned a reading. Power remains unavailable rather than estimated.",
      ...(powerAvailable
        ? {}
        : { suggestedAction: "Install or update the supported graphics driver telemetry tool." }),
      source: options.powerSource ?? "supported-gpu-driver"
    },
    {
      metricName: METRIC_NAMES.GPU_TEMPERATURE_C,
      platform,
      status: gpuTemperatureAvailable ? "available" : "requires_tool",
      reason: gpuTemperatureAvailable
        ? "Collected from a GPU driver or supported local hardware-monitor sensor. This is device-level GPU temperature, not per-process temperature."
        : "No supported GPU temperature provider returned a valid reading.",
      ...(gpuTemperatureAvailable
        ? {}
        : {
            suggestedAction:
              "Install or update the supported graphics driver telemetry tool, or enable WMI sensors in a supported local hardware monitor."
          }),
      source: options.gpuTemperatureSource ?? "supported-gpu-temperature-provider"
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
