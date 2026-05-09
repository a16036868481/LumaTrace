import type {
  Device,
  MetricAvailability,
  MetricCollector,
  Platform,
  Target
} from "@lumatrace/core";
import { AppError } from "../utils/errors";

export class CollectorRegistry {
  private readonly collectors = new Map<string, MetricCollector>();
  private readonly platformCollectors = new Map<Platform, MetricCollector>();
  private readonly deviceCollectors = new Map<string, MetricCollector>();

  register(collector: MetricCollector): void {
    this.collectors.set(collector.id, collector);
    this.platformCollectors.set(collector.platform, collector);
  }

  getByPlatform(platform: Platform): MetricCollector | undefined {
    return this.platformCollectors.get(platform);
  }

  async getByDeviceId(deviceId: string): Promise<MetricCollector | undefined> {
    const existing = this.deviceCollectors.get(deviceId);
    if (existing !== undefined) {
      return existing;
    }

    await this.discoverAllDevices();
    return this.deviceCollectors.get(deviceId);
  }

  async discoverAllDevices(): Promise<Device[]> {
    const devices: Device[] = [];
    for (const collector of this.collectors.values()) {
      let collectorDevices: Device[] = [];
      try {
        collectorDevices = await collector.discoverDevices();
      } catch {
        continue;
      }
      for (const device of collectorDevices) {
        this.deviceCollectors.set(device.id, collector);
        devices.push(device);
      }
    }

    return devices;
  }

  async listTargets(deviceId: string): Promise<Target[]> {
    const collector = await this.getByDeviceId(deviceId);
    if (collector === undefined) {
      throw new AppError("DEVICE_NOT_FOUND", `Device not found: ${deviceId}`, 404, { deviceId });
    }

    return collector.listTargets(deviceId);
  }

  async getCapabilities(platform?: Platform): Promise<MetricAvailability[]> {
    if (platform !== undefined) {
      const collector = this.platformCollectors.get(platform);
      return collector === undefined ? [] : collector.getCapabilities();
    }

    const capabilities: MetricAvailability[] = [];
    for (const collector of this.collectors.values()) {
      capabilities.push(...(await collector.getCapabilities()));
    }
    return capabilities;
  }
}
