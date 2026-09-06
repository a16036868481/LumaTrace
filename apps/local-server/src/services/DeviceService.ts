import type { Device, MetricAvailability, Platform, Target } from "@lumatrace/core";
import type {
  AndroidAppStartOptions,
  AndroidAppStartResult,
  AndroidAppStopOptions,
  AndroidAppStopResult,
  AndroidDiagnosticEvent,
  AndroidDiagnosticsListOptions,
  AndroidDiagnosticsSummary,
  AndroidSessionLogCapture
} from "@lumatrace/collectors-android";
import type {
  PcDiagnosticEvent,
  PcDiagnosticsListOptions,
  PcDiagnosticsSummary
} from "@lumatrace/collectors-pc";
import type { DeviceRepository, TargetRepository } from "@lumatrace/storage";
import type { CollectorRegistry } from "../runtime/CollectorRegistry";
import { AppError } from "../utils/errors";

interface AndroidLifecycleCollector {
  startApp(deviceId: string, packageName: string, options?: AndroidAppStartOptions): Promise<AndroidAppStartResult>;
  stopApp(deviceId: string, packageName: string, options?: AndroidAppStopOptions): Promise<AndroidAppStopResult>;
  getForegroundTarget?(deviceId: string): Promise<Target>;
}

interface AndroidDiagnosticsCollector extends AndroidLifecycleCollector {
  listDiagnostics(options?: AndroidDiagnosticsListOptions): AndroidDiagnosticEvent[];
  summarizeDiagnostics(sessionId?: string): AndroidDiagnosticsSummary;
  getAndroidHealth(deviceId: string): Promise<Record<string, unknown>>;
  getCacheStatus(deviceId?: string): Promise<Record<string, unknown>>;
  refreshCache(deviceId: string): Promise<Record<string, unknown>>;
}

interface PcDiagnosticsCollector {
  listDiagnostics(options?: PcDiagnosticsListOptions): PcDiagnosticEvent[];
  summarizeDiagnostics(sessionId?: string): PcDiagnosticsSummary;
}

interface PcPresentMonCollector extends PcDiagnosticsCollector {
  getPresentMonStatus(deviceId?: string): Promise<unknown>;
  getPresentMonCaptureStatus(sessionId: string): unknown;
}

interface AndroidSessionLogCollector {
  drainSessionLog(sessionId: string): AndroidSessionLogCapture | undefined;
}

function isAndroidLifecycleCollector(collector: unknown): collector is AndroidLifecycleCollector {
  return (
    typeof collector === "object" &&
    collector !== null &&
    "startApp" in collector &&
    "stopApp" in collector &&
    typeof (collector as AndroidLifecycleCollector).startApp === "function" &&
    typeof (collector as AndroidLifecycleCollector).stopApp === "function"
  );
}

function isAndroidDiagnosticsCollector(collector: unknown): collector is AndroidDiagnosticsCollector {
  return (
    isAndroidLifecycleCollector(collector) &&
    "listDiagnostics" in collector &&
    "getAndroidHealth" in collector &&
    typeof (collector as AndroidDiagnosticsCollector).listDiagnostics === "function" &&
    typeof (collector as AndroidDiagnosticsCollector).getAndroidHealth === "function"
  );
}

function isPcDiagnosticsCollector(collector: unknown): collector is PcDiagnosticsCollector {
  return (
    typeof collector === "object" &&
    collector !== null &&
    "listDiagnostics" in collector &&
    "summarizeDiagnostics" in collector &&
    typeof (collector as PcDiagnosticsCollector).listDiagnostics === "function"
  );
}

function isPcPresentMonCollector(collector: unknown): collector is PcPresentMonCollector {
  return (
    isPcDiagnosticsCollector(collector) &&
    "getPresentMonStatus" in collector &&
    "getPresentMonCaptureStatus" in collector &&
    typeof (collector as PcPresentMonCollector).getPresentMonStatus === "function" &&
    typeof (collector as PcPresentMonCollector).getPresentMonCaptureStatus === "function"
  );
}

function isAndroidSessionLogCollector(collector: unknown): collector is AndroidSessionLogCollector {
  return (
    typeof collector === "object" &&
    collector !== null &&
    "drainSessionLog" in collector &&
    typeof (collector as AndroidSessionLogCollector).drainSessionLog === "function"
  );
}

export class DeviceService {
  private readonly registry: CollectorRegistry;
  private readonly deviceRepository: DeviceRepository;
  private readonly targetRepository: TargetRepository;

  constructor(
    registry: CollectorRegistry,
    deviceRepository: DeviceRepository,
    targetRepository: TargetRepository
  ) {
    this.registry = registry;
    this.deviceRepository = deviceRepository;
    this.targetRepository = targetRepository;
  }

  async discoverDevices(): Promise<Device[]> {
    const devices = await this.registry.discoverAllDevices();
    for (const device of devices) {
      this.deviceRepository.upsert(device);
    }
    return devices;
  }

  async getDevice(id: string): Promise<Device | null> {
    const stored = this.deviceRepository.getById(id);
    if (stored !== null) {
      return stored;
    }

    await this.discoverDevices();
    return this.deviceRepository.getById(id);
  }

  async listTargets(deviceId: string): Promise<Target[]> {
    const device = await this.getDevice(deviceId);
    if (device === null) {
      throw new AppError("DEVICE_NOT_FOUND", `Device not found: ${deviceId}`, 404, { deviceId });
    }

    const targets = await this.registry.listTargets(deviceId);
    for (const target of targets) {
      this.targetRepository.upsert(deviceId, target);
    }
    return targets;
  }

  async getTarget(deviceId: string, targetId: string): Promise<Target | null> {
    const stored = this.targetRepository.getById(targetId);
    if (stored !== null) {
      return stored;
    }

    await this.listTargets(deviceId);
    return this.targetRepository.getById(targetId);
  }

  async getCapabilities(platform?: Platform): Promise<MetricAvailability[]> {
    return this.registry.getCapabilities(platform);
  }

  async startAndroidApp(
    deviceId: string,
    packageName: string,
    options: AndroidAppStartOptions = {}
  ): Promise<AndroidAppStartResult> {
    const device = await this.getDevice(deviceId);
    if (device === null) {
      throw new AppError("DEVICE_NOT_FOUND", `Device not found: ${deviceId}`, 404, { deviceId });
    }
    if (device.platform !== "android") {
      throw new AppError("INVALID_REQUEST", "Android app lifecycle routes require an Android device.", 400, {
        deviceId
      });
    }
    const collector = await this.registry.getByDeviceId(deviceId);
    if (!isAndroidLifecycleCollector(collector)) {
      throw new AppError("INVALID_REQUEST", "Android lifecycle collector is unavailable.", 400, { deviceId });
    }
    return collector.startApp(deviceId, packageName, options);
  }

  async stopAndroidApp(
    deviceId: string,
    packageName: string,
    options: AndroidAppStopOptions = {}
  ): Promise<AndroidAppStopResult> {
    const device = await this.getDevice(deviceId);
    if (device === null) {
      throw new AppError("DEVICE_NOT_FOUND", `Device not found: ${deviceId}`, 404, { deviceId });
    }
    if (device.platform !== "android") {
      throw new AppError("INVALID_REQUEST", "Android app lifecycle routes require an Android device.", 400, {
        deviceId
      });
    }
    const collector = await this.registry.getByDeviceId(deviceId);
    if (!isAndroidLifecycleCollector(collector)) {
      throw new AppError("INVALID_REQUEST", "Android lifecycle collector is unavailable.", 400, { deviceId });
    }
    return collector.stopApp(deviceId, packageName, options);
  }

  async getAndroidForegroundTarget(deviceId: string): Promise<Target> {
    const device = await this.getDevice(deviceId);
    if (device === null) {
      throw new AppError("DEVICE_NOT_FOUND", `Device not found: ${deviceId}`, 404, { deviceId });
    }
    if (device.platform !== "android") {
      throw new AppError("INVALID_REQUEST", "Foreground app detection requires an Android device.", 400, {
        deviceId
      });
    }
    const collector = await this.registry.getByDeviceId(deviceId);
    if (!isAndroidLifecycleCollector(collector) || typeof collector.getForegroundTarget !== "function") {
      throw new AppError("INVALID_REQUEST", "Android foreground app detection is unavailable.", 400, { deviceId });
    }
    const target = await collector.getForegroundTarget(deviceId);
    this.targetRepository.upsert(deviceId, target);
    return target;
  }

  listAndroidDiagnostics(options: AndroidDiagnosticsListOptions = {}): AndroidDiagnosticEvent[] {
    const collector = this.registry.getByPlatform("android");
    if (!isAndroidDiagnosticsCollector(collector)) {
      return [];
    }
    return collector.listDiagnostics(options);
  }

  summarizeAndroidDiagnostics(sessionId?: string): AndroidDiagnosticsSummary | null {
    const collector = this.registry.getByPlatform("android");
    if (!isAndroidDiagnosticsCollector(collector)) {
      return null;
    }
    return collector.summarizeDiagnostics(sessionId);
  }

  drainAndroidSessionLog(sessionId: string): AndroidSessionLogCapture | undefined {
    const collector = this.registry.getByPlatform("android");
    if (!isAndroidSessionLogCollector(collector)) {
      return undefined;
    }
    return collector.drainSessionLog(sessionId);
  }

  listPcDiagnostics(options: PcDiagnosticsListOptions = {}): PcDiagnosticEvent[] {
    const collector = this.registry.getByPlatform("windows");
    if (!isPcDiagnosticsCollector(collector)) {
      return [];
    }
    return collector.listDiagnostics(options);
  }

  summarizePcDiagnostics(sessionId?: string): PcDiagnosticsSummary | null {
    const collector = this.registry.getByPlatform("windows");
    if (!isPcDiagnosticsCollector(collector)) {
      return null;
    }
    return collector.summarizeDiagnostics(sessionId);
  }

  async getPcPresentMonStatus(deviceId: string): Promise<unknown> {
    const device = await this.getDevice(deviceId);
    if (device === null) {
      throw new AppError("DEVICE_NOT_FOUND", `Device not found: ${deviceId}`, 404, { deviceId });
    }
    if (device.platform !== "windows") {
      throw new AppError("INVALID_REQUEST", "PresentMon status requires a Windows PC device.", 400, {
        deviceId
      });
    }
    const collector = await this.registry.getByDeviceId(deviceId);
    if (!isPcPresentMonCollector(collector)) {
      throw new AppError("INVALID_REQUEST", "PC PresentMon collector is unavailable.", 400, { deviceId });
    }
    return collector.getPresentMonStatus(deviceId);
  }

  getPcPresentMonCaptureStatus(sessionId: string): unknown {
    const collector = this.registry.getByPlatform("windows");
    if (!isPcPresentMonCollector(collector)) {
      throw new AppError("INVALID_REQUEST", "PC PresentMon collector is unavailable.", 400);
    }
    return collector.getPresentMonCaptureStatus(sessionId);
  }

  async getAndroidHealth(deviceId: string): Promise<Record<string, unknown>> {
    const device = await this.getDevice(deviceId);
    if (device === null) {
      throw new AppError("DEVICE_NOT_FOUND", `Device not found: ${deviceId}`, 404, { deviceId });
    }
    if (device.platform !== "android") {
      throw new AppError("INVALID_REQUEST", "Android health requires an Android device.", 400, { deviceId });
    }
    const collector = await this.registry.getByDeviceId(deviceId);
    if (!isAndroidDiagnosticsCollector(collector)) {
      throw new AppError("INVALID_REQUEST", "Android diagnostics collector is unavailable.", 400, { deviceId });
    }
    return collector.getAndroidHealth(deviceId);
  }

  async getAndroidCacheStatus(deviceId: string): Promise<Record<string, unknown>> {
    const collector = await this.registry.getByDeviceId(deviceId);
    if (!isAndroidDiagnosticsCollector(collector)) {
      throw new AppError("INVALID_REQUEST", "Android diagnostics collector is unavailable.", 400, { deviceId });
    }
    return collector.getCacheStatus(deviceId);
  }

  async refreshAndroidCache(deviceId: string): Promise<Record<string, unknown>> {
    const collector = await this.registry.getByDeviceId(deviceId);
    if (!isAndroidDiagnosticsCollector(collector)) {
      throw new AppError("INVALID_REQUEST", "Android diagnostics collector is unavailable.", 400, { deviceId });
    }
    return collector.refreshCache(deviceId);
  }
}
