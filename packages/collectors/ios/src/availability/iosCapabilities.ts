import { METRIC_NAMES, type MetricAvailability, type MetricAvailabilityStatus } from "@lumatrace/core";

export interface IosCapabilityOptions {
  xcrunAvailable?: boolean;
  platform?: NodeJS.Platform;
}

function xcodeStatus(options: IosCapabilityOptions): MetricAvailabilityStatus {
  if (options.platform !== undefined && options.platform !== "darwin") {
    return "requires_xcode";
  }
  return options.xcrunAvailable === true ? "available" : "requires_xcode";
}

export function getIosCapabilities(options: IosCapabilityOptions = {}): MetricAvailability[] {
  const discoveryStatus = xcodeStatus(options);
  const discoveryReason =
    discoveryStatus === "available"
      ? "iOS device and simulator discovery uses public Xcode command line tools through xcrun xctrace."
      : "iOS discovery requires macOS with Xcode command line tools and xcrun.";
  const xcodeAction =
    discoveryStatus === "available"
      ? "Connect an iOS device or boot a simulator, then refresh devices."
      : "Install Xcode command line tools on macOS and ensure xcrun is available.";

  return [
    {
      metricName: "ios.device_discovery",
      platform: "ios",
      status: discoveryStatus,
      reason: discoveryReason,
      suggestedAction: xcodeAction,
      source: "xcrun:xctrace list devices"
    },
    {
      metricName: "ios.simulator_app_list",
      platform: "ios",
      status: discoveryStatus,
      reason: "Simulator app target listing uses xcrun simctl listapps. Physical device app listing is not claimed in this foundation batch.",
      suggestedAction: xcodeAction,
      source: "xcrun:simctl listapps"
    },
    {
      metricName: "xcrun",
      platform: "ios",
      status: discoveryStatus,
      reason: discoveryReason,
      suggestedAction: xcodeAction,
      source: "xcode-command-line-tools"
    },
    {
      metricName: "ios.xctrace_capture",
      platform: "ios",
      status: discoveryStatus === "available" ? "experimental" : "requires_xcode",
      reason:
        discoveryStatus === "available"
          ? "Explicit xcrun xctrace record/export capture is available as an experimental macOS/Xcode workflow. Metrics are emitted only after target matching succeeds."
          : "Automatic iOS xctrace capture requires macOS with Xcode command line tools and xcrun.",
      suggestedAction:
        discoveryStatus === "available"
          ? "Run capture only by explicit user action and keep missing or unmatched metrics as N/A."
          : xcodeAction,
      source: "xcrun:xctrace record/export"
    },
    {
      metricName: METRIC_NAMES.CPU_PERCENT,
      platform: "ios",
      status: "requires_manual_trace",
      reason: "iOS process CPU sampling is not implemented in Foundation. Future work may use explicit Instruments/xctrace workflows where supported.",
      suggestedAction: "Use exported traces only after explicit user action; do not treat unavailable CPU as zero.",
      source: "xctrace:planned"
    },
    {
      metricName: METRIC_NAMES.MEMORY_MB,
      platform: "ios",
      status: "requires_manual_trace",
      reason: "iOS process memory sampling is not implemented in Foundation. Future work may require explicit Instruments/xctrace workflows.",
      suggestedAction: "Keep memory unavailable until a supported trace path is implemented.",
      source: "xctrace:planned"
    },
    {
      metricName: METRIC_NAMES.FPS,
      platform: "ios",
      status: "requires_manual_trace",
      reason: "iOS FPS requires an explicit supported trace workflow and target matching. No live FPS is emitted in Foundation.",
      suggestedAction: "Do not infer FPS from unavailable iOS data.",
      source: "xctrace:planned"
    },
    {
      metricName: METRIC_NAMES.FRAME_TIME_MS,
      platform: "ios",
      status: "requires_manual_trace",
      reason: "iOS frame time requires per-frame trace data. Foundation does not fabricate frame times.",
      suggestedAction: "Do not derive frame_time_ms from average FPS or missing trace data.",
      source: "xctrace:planned"
    },
    {
      metricName: METRIC_NAMES.NETWORK_RX_BYTES,
      platform: "ios",
      status: "unavailable",
      reason: "LumaTrace does not claim target process network counters for non-jailbroken iOS.",
      suggestedAction: "Leave iOS target network unavailable unless a supported, permission-respecting source is added.",
      source: "ios:unavailable"
    },
    {
      metricName: METRIC_NAMES.NETWORK_TX_BYTES,
      platform: "ios",
      status: "unavailable",
      reason: "LumaTrace does not claim target process network counters for non-jailbroken iOS.",
      suggestedAction: "Leave iOS target network unavailable unless a supported, permission-respecting source is added.",
      source: "ios:unavailable"
    }
  ];
}
