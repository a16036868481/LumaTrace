import { METRIC_NAMES, type MetricAvailability, type Platform } from "@lumatrace/core";
import type { DeviceService } from "./DeviceService";

const PLATFORMS: readonly Platform[] = ["android", "ios", "windows", "macos", "linux"];

function unavailablePlatformCapabilities(platform: Platform): MetricAvailability[] {
  const baseReason = `Real ${platform} collection is not implemented in MVP-A.`;
  return [
    {
      metricName: METRIC_NAMES.FPS,
      platform,
      status: platform === "android" ? "experimental" : "unavailable",
      reason: baseReason,
      source: "mvp-a"
    },
    {
      metricName: METRIC_NAMES.CPU_PERCENT,
      platform,
      status: "requires_tool",
      reason: baseReason,
      suggestedAction: "Use MockCollector in MVP-A or wait for the platform collector milestone.",
      source: "mvp-a"
    },
    {
      metricName: METRIC_NAMES.MEMORY_MB,
      platform,
      status: "requires_tool",
      reason: baseReason,
      suggestedAction: "Use MockCollector in MVP-A or wait for the platform collector milestone.",
      source: "mvp-a"
    }
  ];
}

export class CapabilityService {
  private readonly deviceService: DeviceService;

  constructor(deviceService: DeviceService) {
    this.deviceService = deviceService;
  }

  async list(platform?: Platform): Promise<MetricAvailability[]> {
    if (platform === undefined) {
      const all: MetricAvailability[] = [];
      for (const item of PLATFORMS) {
        all.push(...(await this.list(item)));
      }
      return all;
    }

    const collectorCapabilities = await this.deviceService.getCapabilities(platform);
    if (collectorCapabilities.length > 0) {
      return collectorCapabilities;
    }

    return unavailablePlatformCapabilities(platform);
  }
}
