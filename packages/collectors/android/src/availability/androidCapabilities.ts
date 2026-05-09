import { METRIC_NAMES, type MetricAvailability, type MetricAvailabilityStatus } from "@lumatrace/core";
import { buildAndroidFpsAvailability } from "../fps/fpsAvailability";

const DISCOVERY_METRICS = [
  "android.device_discovery",
  "android.device_info",
  "android.package_list",
  "android.pid"
] as const;

export function getAndroidCapabilities(adbAvailable = true): MetricAvailability[] {
  const adbStatus: MetricAvailabilityStatus = adbAvailable ? "available" : "requires_tool";
  const adbReason = adbAvailable
    ? "Available through Android Debug Bridge in Milestone 2C."
    : "Android Debug Bridge is required for Android discovery and Android 2C sampling.";
  const networkStatus: MetricAvailabilityStatus = adbAvailable ? "experimental" : "requires_tool";

  return [
    ...DISCOVERY_METRICS.map((metricName) => ({
      metricName,
      platform: "android" as const,
      status: adbStatus,
      reason: adbReason,
      suggestedAction: adbAvailable
        ? "Use USB debugging and an authorized device."
        : "Install Android SDK Platform Tools and make adb available.",
      source: "adb"
    })),
    {
      metricName: "android.app_start",
      platform: "android",
      status: adbStatus,
      reason: "Uses adb shell am start -W when a launcher activity is known. Monkey fallback is optional and disabled by default.",
      suggestedAction: adbAvailable
        ? "Use this only as an explicit user action or with autoStartTarget enabled in session config."
        : "Install Android SDK Platform Tools and make adb available.",
      source: "adb"
    },
    {
      metricName: "android.app_force_stop",
      platform: "android",
      status: adbStatus,
      reason: "Uses adb shell am force-stop only as an explicit user action or when stopTargetOnSessionStop is enabled.",
      suggestedAction: adbAvailable
        ? "Do not treat force-stop as a harmless default; it stops the target package on the device."
        : "Install Android SDK Platform Tools and make adb available.",
      source: "adb"
    },
    {
      metricName: "android.launcher_activity_discovery",
      platform: "android",
      status: adbStatus,
      reason: "Discovers launcher activities from adb shell dumpsys package <package>.",
      suggestedAction: adbAvailable
        ? "Use explicit launcher selection when multiple launchers are present."
        : "Install Android SDK Platform Tools and make adb available.",
      source: "adb"
    },
    {
      metricName: "android.process_rebind",
      platform: "android",
      status: adbAvailable ? "experimental" : "requires_tool",
      reason:
        "Best-effort PID rebind during a running session. CPU samplers reset baseline after a target process restart.",
      suggestedAction: adbAvailable
        ? "Treat rebind events as diagnostics and avoid interpreting missing intervals as zero usage."
        : "Install Android SDK Platform Tools and make adb available.",
      source: "adb"
    },
    {
      metricName: "adb",
      platform: "android",
      status: adbStatus,
      reason: adbReason,
      suggestedAction: adbAvailable
        ? "Use adb devices -l diagnostics when devices do not appear."
        : "Install Android SDK Platform Tools.",
      source: "adb"
    },
    {
      metricName: METRIC_NAMES.CPU_PERCENT,
      platform: "android",
      status: adbStatus,
      reason:
        "Collected from /proc/stat and /proc/<pid>/stat over a sampling window. First sample is used as baseline.",
      suggestedAction: adbAvailable
        ? "Start a session for an already-running Android app process."
        : "Install Android SDK Platform Tools and make adb available.",
      source: "adb"
    },
    {
      metricName: METRIC_NAMES.MEMORY_MB,
      platform: "android",
      status: adbStatus,
      reason:
        "Collected from dumpsys meminfo <package>. Falls back to /proc/<pid>/status with lower confidence when needed.",
      suggestedAction: adbAvailable
        ? "Ensure the target app is already running before starting a session."
        : "Install Android SDK Platform Tools and make adb available.",
      source: "adb"
    },
    {
      metricName: METRIC_NAMES.BATTERY_LEVEL_PERCENT,
      platform: "android",
      status: adbStatus,
      reason: "Collected from dumpsys battery when the device reports level and scale.",
      suggestedAction: adbAvailable
        ? "Missing fields are left unavailable instead of being estimated."
        : "Install Android SDK Platform Tools and make adb available.",
      source: "adb"
    },
    {
      metricName: METRIC_NAMES.BATTERY_TEMPERATURE_C,
      platform: "android",
      status: "experimental",
      reason: "Device-dependent field from dumpsys battery. Missing on some devices.",
      suggestedAction: "Treat this field as unavailable when the device omits battery temperature.",
      source: "adb"
    },
    {
      metricName: METRIC_NAMES.BATTERY_VOLTAGE_MV,
      platform: "android",
      status: "experimental",
      reason: "Device-dependent field from dumpsys battery. Missing on some devices.",
      suggestedAction: "Treat this field as unavailable when the device omits battery voltage.",
      source: "adb"
    },
    {
      metricName: METRIC_NAMES.BATTERY_CURRENT_MA,
      platform: "android",
      status: "experimental",
      reason: "Device-dependent current-now field from dumpsys battery. Missing on some devices.",
      suggestedAction: "Treat this field as unavailable when the device omits current now.",
      source: "adb"
    },
    {
      metricName: METRIC_NAMES.NETWORK_RX_BYTES,
      platform: "android",
      status: networkStatus,
      reason:
        "Attempts UID-level network deltas via dumpsys netstats detail and falls back to device-level /proc/net/dev when unavailable.",
      suggestedAction:
        adbAvailable
          ? "Device-level network data is not app-level traffic and must not be interpreted as target-only traffic."
          : "Install Android SDK Platform Tools and make adb available.",
      source: "adb:dumpsys netstats detail"
    },
    {
      metricName: METRIC_NAMES.NETWORK_TX_BYTES,
      platform: "android",
      status: networkStatus,
      reason:
        "Attempts UID-level network deltas via dumpsys netstats detail and falls back to device-level /proc/net/dev when unavailable.",
      suggestedAction:
        adbAvailable
          ? "Device-level network data is not app-level traffic and must not be interpreted as target-only traffic."
          : "Install Android SDK Platform Tools and make adb available.",
      source: "adb:dumpsys netstats detail"
    },
    {
      metricName: METRIC_NAMES.NETWORK_RX_RATE_BPS,
      platform: "android",
      status: networkStatus,
      reason:
        "Derived from Android network byte deltas over the sampling window. UID-level availability varies by Android version and device.",
      suggestedAction:
        adbAvailable
          ? "Check event precision; device_level rates can include traffic from other apps."
          : "Install Android SDK Platform Tools and make adb available.",
      source: "adb:dumpsys netstats detail"
    },
    {
      metricName: METRIC_NAMES.NETWORK_TX_RATE_BPS,
      platform: "android",
      status: networkStatus,
      reason:
        "Derived from Android network byte deltas over the sampling window. UID-level availability varies by Android version and device.",
      suggestedAction:
        adbAvailable
          ? "Check event precision; device_level rates can include traffic from other apps."
          : "Install Android SDK Platform Tools and make adb available.",
      source: "adb:dumpsys netstats detail"
    },
    ...buildAndroidFpsAvailability()
  ];
}
