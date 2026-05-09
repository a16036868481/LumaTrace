import { createHash } from "node:crypto";
import {
  CollectorError,
  CommandRunner,
  type Device,
  type MetricAvailability,
  type MetricEvent,
  type MetricCollector,
  type Session,
  type SessionConfig,
  type Target,
  type ToolStatus
} from "@lumatrace/core";
import { getIosCapabilities } from "./availability/iosCapabilities";
import type {
  IosAppInfo,
  IosCollectorOptions,
  IosDeviceInfo,
  IosToolClient,
  IosXctraceCaptureOptions,
  IosXctraceCaptureResult
} from "./types";
import { XcrunToolClient } from "./tools/XcrunToolClient";
import { IosXctraceCaptureRuntime } from "./trace/IosXctraceCaptureRuntime";

function hashIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function maskUdid(udid: string): string {
  if (udid.length <= 8) {
    return "<ios-udid>";
  }
  return `${udid.slice(0, 4)}...${udid.slice(-4)}`;
}

function deviceIdFromInfo(device: IosDeviceInfo): string {
  return `${device.deviceType === "simulator" ? "ios-simulator" : "ios"}:${hashIdentifier(device.udid)}`;
}

function appToTarget(deviceId: string, app: IosAppInfo): Target {
  return {
    id: `ios-app:${deviceId}:${app.bundleId}`,
    name: app.displayName ?? app.name ?? app.bundleId,
    type: "app",
    platform: "ios",
    bundleId: app.bundleId,
    tags: {
      source: "xcrun:simctl listapps",
      applicationType: app.applicationType ?? "unknown"
    }
  };
}

export class IosCollector implements MetricCollector {
  readonly id = "ios-xcrun";
  readonly platform = "ios" as const;

  private readonly platformName: NodeJS.Platform;
  private readonly toolClient: IosToolClient;
  private readonly captureRuntime: IosXctraceCaptureRuntime;
  private readonly devicesById = new Map<string, IosDeviceInfo>();
  private readonly targetsByDeviceId = new Map<string, Target[]>();

  constructor(options: IosCollectorOptions = {}) {
    this.platformName = options.platform ?? process.platform;
    this.toolClient =
      options.toolClient ??
      new XcrunToolClient({
        commandRunner: options.commandRunner ?? new CommandRunner(),
        platform: this.platformName,
        ...(options.env === undefined ? {} : { env: options.env }),
        ...(options.xcrunPath === undefined ? {} : { xcrunPath: options.xcrunPath })
      });
    this.captureRuntime = new IosXctraceCaptureRuntime({
      toolClient: this.toolClient,
      commandRunner: options.commandRunner ?? new CommandRunner()
    });
  }

  async getToolStatus(): Promise<ToolStatus> {
    return (await this.toolClient.getToolStatus()).toolStatus;
  }

  async discoverDevices(): Promise<Device[]> {
    const status = await this.toolClient.getToolStatus();
    const capabilities = await this.getCapabilities();
    if (status.toolStatus.status !== "available") {
      this.devicesById.clear();
      return [];
    }

    const devices = await this.toolClient.listDevices();
    this.devicesById.clear();
    return devices.map((iosDevice) => {
      const id = deviceIdFromInfo(iosDevice);
      this.devicesById.set(id, iosDevice);
      const device: Device = {
        id,
        platform: "ios",
        name: iosDevice.name,
        connectionType: iosDevice.deviceType === "simulator" ? "local" : "usb",
        capabilities,
        tags: {
          source: "xcrun:xctrace list devices",
          isSimulator: iosDevice.deviceType === "simulator",
          maskedUdid: maskUdid(iosDevice.udid),
          ...(iosDevice.state === undefined ? {} : { state: iosDevice.state })
        }
      };
      if (iosDevice.osVersion !== undefined) {
        device.osVersion = iosDevice.osVersion;
      }
      return device;
    });
  }

  async listTargets(deviceId: string): Promise<Target[]> {
    const device = await this.resolveDevice(deviceId);
    if (device.deviceType !== "simulator") {
      this.targetsByDeviceId.set(deviceId, []);
      return [];
    }
    const apps = await this.toolClient.listSimulatorApps(device.udid);
    const targets = apps.slice(0, 500).map((app) => appToTarget(deviceId, app));
    this.targetsByDeviceId.set(deviceId, targets);
    return targets;
  }

  async getCapabilities(): Promise<MetricAvailability[]> {
    const status = await this.toolClient.getToolStatus();
    return getIosCapabilities({
      platform: this.platformName,
      xcrunAvailable: status.toolStatus.status === "available"
    });
  }

  async startSession(config: SessionConfig): Promise<Session> {
    throw new CollectorError(
      "iOS metric sessions are not implemented in iOS Foundation. Metrics require future explicit trace workflows.",
      "IOS_SESSION_REQUIRES_MANUAL_TRACE",
      {
        collectorId: this.id,
        deviceId: config.deviceId,
        targetId: config.targetId,
        ...(config.id === undefined ? {} : { sessionId: config.id })
      }
    );
  }

  async captureXctrace(options: Omit<IosXctraceCaptureOptions, "udid">): Promise<IosXctraceCaptureResult> {
    const device = await this.resolveDevice(options.deviceId);
    return this.captureRuntime.capture({
      ...options,
      udid: device.udid
    });
  }

  async pauseSession(sessionId: string): Promise<void> {
    throw new CollectorError("iOS session does not exist.", "SESSION_NOT_FOUND", {
      collectorId: this.id,
      sessionId
    });
  }

  async stopSession(sessionId: string): Promise<void> {
    throw new CollectorError("iOS session does not exist.", "SESSION_NOT_FOUND", {
      collectorId: this.id,
      sessionId
    });
  }

  streamMetrics(sessionId: string): AsyncIterable<MetricEvent> {
    throw new CollectorError("iOS session does not exist.", "SESSION_NOT_FOUND", {
      collectorId: this.id,
      sessionId
    });
  }

  private async resolveDevice(deviceId: string): Promise<IosDeviceInfo> {
    let device = this.devicesById.get(deviceId);
    if (device !== undefined) {
      return device;
    }
    await this.discoverDevices();
    device = this.devicesById.get(deviceId);
    if (device === undefined) {
      throw new CollectorError("iOS device does not exist.", "DEVICE_NOT_FOUND", {
        collectorId: this.id,
        deviceId
      });
    }
    return device;
  }
}
