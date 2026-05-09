import { createHash } from "node:crypto";
import {
  CollectorError,
  CommandRunner,
  ToolUnavailableError,
  type Device,
  type MetricAvailability,
  type MetricEvent,
  type MetricCollector,
  type Session,
  type SessionConfig,
  type Target,
  type ToolStatus
} from "@lumatrace/core";
import { AdbClient } from "./adb/AdbClient";
import {
  isKnownMumuAdbPort,
  isLocalhostAdbSerial,
  parseLocalhostAdbPort
} from "./adb/LocalAndroidEmulatorDiscovery";
import { findAdb } from "./adb/findAdb";
import { getAndroidCapabilities } from "./availability/androidCapabilities";
import { AndroidDeviceInfoCache } from "./cache/AndroidDeviceInfoCache";
import { AndroidLauncherCache } from "./cache/AndroidLauncherCache";
import { AndroidDiagnosticCollector } from "./diagnostics/AndroidDiagnosticCollector";
import type {
  AndroidDiagnosticEvent,
  AndroidDiagnosticsListOptions,
  AndroidDiagnosticsSummary
} from "./diagnostics/AndroidDiagnosticEvent";
import { AndroidFpsProbe, type AndroidFpsProbeLike } from "./fps/AndroidFpsProbe";
import { AndroidAppLifecycle } from "./lifecycle/AndroidAppLifecycle";
import type {
  AndroidAppStartOptions,
  AndroidAppStartResult,
  AndroidAppStopOptions,
  AndroidAppStopResult,
  AndroidProcessMissingPolicy
} from "./lifecycle/AndroidLifecycleTypes";
import { getAndroidDeviceInfoFromProps } from "./parsers/parseGetProp";
import { AndroidSessionRuntime } from "./sampling/AndroidSessionRuntime";
import { packageToTarget, type AndroidAdbClientLike, type AndroidAdbDevice, type AndroidCollectorOptions } from "./types";

interface ResolvedAdb {
  client: AndroidAdbClientLike | null;
  toolStatus: ToolStatus;
}

function hashSerial(serial: string): string {
  return createHash("sha256").update(serial).digest("hex").slice(0, 12);
}

function deviceIdFromSerial(serial: string): string {
  if (serial.startsWith("emulator-")) {
    return `android:${serial}`;
  }
  return `android:${hashSerial(serial)}`;
}

function maskSerial(serial: string): string {
  if (serial.startsWith("emulator-")) {
    return serial;
  }
  if (serial.length <= 8) {
    return "<device-serial>";
  }
  return `${serial.slice(0, 4)}...${serial.slice(-4)}`;
}

function connectionTypeFromSerial(serial: string): Device["connectionType"] {
  if (serial.startsWith("emulator-")) {
    return "local";
  }
  return serial.includes(":") ? "network" : "usb";
}

function cloneCapabilities(capabilities: readonly MetricAvailability[]): MetricAvailability[] {
  return capabilities.map((capability) => ({ ...capability }));
}

function booleanOption(options: Record<string, unknown> | undefined, key: string, fallback = false): boolean {
  const value = options?.[key];
  return typeof value === "boolean" ? value : fallback;
}

function numberOption(options: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = options?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringOption(options: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = options?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function processMissingPolicyOption(
  options: Record<string, unknown> | undefined
): AndroidProcessMissingPolicy {
  const value = options?.processMissingPolicy;
  if (
    value === "fail_session" ||
    value === "pause_process_metrics_keep_device_metrics" ||
    value === "wait_for_rebind"
  ) {
    return value;
  }
  return "pause_process_metrics_keep_device_metrics";
}

function stateCapabilities(state: AndroidAdbDevice["state"], adbAvailable: boolean): MetricAvailability[] {
  const capabilities = getAndroidCapabilities(adbAvailable);
  if (state === "device") {
    return capabilities;
  }

  return capabilities.map((capability) => {
    if (capability.source !== "adb") {
      return capability;
    }
    return {
      ...capability,
      status: state === "unauthorized" ? "requires_permission" : "unavailable",
      reason:
        state === "unauthorized"
          ? "ADB reported the device as unauthorized. Confirm the RSA debugging prompt on the device."
          : `ADB reported the device as ${state}. Shell commands are not executed for this device.`,
      suggestedAction:
        state === "unauthorized"
          ? "Unlock the device and allow USB debugging for this computer."
          : "Reconnect the device and check adb devices -l."
    };
  });
}

const blockedForegroundPackages = new Set([
  "android",
  "com.android.settings",
  "com.android.systemui",
  "com.google.android.apps.nexuslauncher",
  "com.miui.home"
]);

export class AndroidCollector implements MetricCollector {
  readonly id = "android-adb";
  readonly platform = "android" as const;

  private readonly adbPath: string | undefined;
  private readonly defaultTimeoutMs: number;
  private readonly maxOutputBytes: number;
  private readonly injectedClient: AndroidAdbClientLike | undefined;
  private readonly fpsProbeFactory: AndroidCollectorOptions["fpsProbeFactory"];
  private readonly commandRunner = new CommandRunner();
  private readonly diagnostics = new AndroidDiagnosticCollector();
  private readonly launcherCache = new AndroidLauncherCache();
  private readonly deviceInfoCache = new AndroidDeviceInfoCache();
  private resolvedAdb: Promise<ResolvedAdb> | undefined;
  private readonly serialByDeviceId = new Map<string, string>();
  private readonly deviceStateById = new Map<string, AndroidAdbDevice["state"]>();
  private readonly targetsByDeviceId = new Map<string, Target[]>();
  private readonly runtimes = new Map<string, AndroidSessionRuntime>();
  private readonly finalMetrics = new Map<string, MetricEvent[]>();

  constructor(options: AndroidCollectorOptions = {}) {
    this.adbPath = options.adbPath;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 5000;
    this.maxOutputBytes = options.maxOutputBytes ?? 1024 * 1024;
    this.injectedClient = options.adbClient;
    this.fpsProbeFactory = options.fpsProbeFactory;
  }

  async getToolStatus(): Promise<ToolStatus> {
    return (await this.ensureAdb()).toolStatus;
  }

  listDiagnostics(options: AndroidDiagnosticsListOptions = {}): AndroidDiagnosticEvent[] {
    return this.diagnostics.list(options);
  }

  summarizeDiagnostics(sessionId?: string): AndroidDiagnosticsSummary {
    return this.diagnostics.summarize(sessionId);
  }

  async discoverDevices(): Promise<Device[]> {
    const resolved = await this.ensureAdb();
    if (resolved.client === null) {
      this.diagnostics.add({
        level: "warn",
        category: "adb",
        code: "ADB_MISSING",
        message: resolved.toolStatus.reason ?? "adb is unavailable.",
        details: {
          status: resolved.toolStatus.status,
          suggestedAction: resolved.toolStatus.suggestedAction
        }
      });
      return [];
    }

    const adbDevices = await resolved.client.listDevices();
    const devices: Device[] = [];
    const localEmulatorAndroidIds = new Map<string, { deviceId: string; serial: string }>();
    let localEmulatorDisplayIndex = 0;
    this.serialByDeviceId.clear();
    this.deviceStateById.clear();

    for (const adbDevice of adbDevices) {
      const id = deviceIdFromSerial(adbDevice.serial);
      const isLocalEmulatorEndpoint = isLocalhostAdbSerial(adbDevice.serial);
      const localEmulatorPort = parseLocalhostAdbPort(adbDevice.serial);
      const tags: Record<string, string | number | boolean> = {
        adbState: adbDevice.state,
        maskedSerial: maskSerial(adbDevice.serial),
        source: "adb"
      };
      if (isLocalEmulatorEndpoint) {
        tags.localEmulatorEndpoint = adbDevice.serial;
        if (localEmulatorPort !== undefined) {
          tags.localEmulatorPort = localEmulatorPort;
          tags.localEmulatorKind = isKnownMumuAdbPort(localEmulatorPort) ? "mumu" : "android_emulator";
        }
      }
      if (adbDevice.state === "unauthorized") {
        this.diagnostics.add({
          level: "warn",
          category: "device",
          code: "DEVICE_UNAUTHORIZED",
          message: "ADB reported an Android device as unauthorized.",
          deviceId: id,
          details: {
            maskedSerial: maskSerial(adbDevice.serial),
            state: adbDevice.state
          }
        });
      } else if (adbDevice.state === "offline") {
        this.diagnostics.add({
          level: "warn",
          category: "device",
          code: "DEVICE_OFFLINE",
          message: "ADB reported an Android device as offline.",
          deviceId: id,
          details: {
            maskedSerial: maskSerial(adbDevice.serial),
            state: adbDevice.state
          }
        });
      }
      for (const [key, value] of Object.entries({
        product: adbDevice.product,
        model: adbDevice.model,
        device: adbDevice.device,
        transportId: adbDevice.transportId
      })) {
        if (value !== undefined) {
          tags[key] = value;
        }
      }

      let name = adbDevice.model ?? maskSerial(adbDevice.serial);
      let osVersion: string | undefined;
      let androidId: string | undefined;
      if (adbDevice.state === "device") {
        try {
          const cached = this.deviceInfoCache.get(adbDevice.serial);
          if (cached !== null) {
            name = cached.name ?? name;
            osVersion = cached.osVersion;
            Object.assign(tags, cached.propsSummary);
          } else {
            const props = await resolved.client.getProps(adbDevice.serial);
            const info = getAndroidDeviceInfoFromProps(props, name);
            name = info.name;
            osVersion = info.osVersion;
            Object.assign(tags, info.tags);
            this.deviceInfoCache.set(adbDevice.serial, {
              propsSummary: info.tags,
              name: info.name,
              ...(info.osVersion === undefined ? {} : { osVersion: info.osVersion }),
              ...(info.manufacturer === undefined ? {} : { manufacturer: info.manufacturer }),
              ...(typeof info.tags.model === "string" ? { model: info.tags.model } : {})
            });
          }
          if (resolved.client.getSecureAndroidId !== undefined) {
            androidId = await resolved.client.getSecureAndroidId(adbDevice.serial);
            if (androidId !== undefined) {
              tags.androidIdHash = hashSerial(androidId);
            }
          }
        } catch {
          tags.getpropUnavailable = true;
        }
      }

      if (isLocalEmulatorEndpoint && androidId !== undefined) {
        const existing = localEmulatorAndroidIds.get(androidId);
        if (existing !== undefined) {
          this.diagnostics.add({
            level: "info",
            category: "adb",
            code: "ADB_LOCAL_EMULATOR_ALIAS_DEDUPED",
            message: "Skipped a duplicate local Android emulator endpoint.",
            deviceId: existing.deviceId,
            details: {
              keptEndpoint: existing.serial,
              skippedEndpoint: adbDevice.serial,
              androidIdHash: hashSerial(androidId)
            }
          });
          continue;
        }
      }

      if (isLocalEmulatorEndpoint && androidId !== undefined) {
        localEmulatorAndroidIds.set(androidId, { deviceId: id, serial: adbDevice.serial });
      }
      const emulatorKind =
        localEmulatorPort !== undefined && isKnownMumuAdbPort(localEmulatorPort)
          ? "MuMu"
          : "Android Emulator";
      const displayName = isLocalEmulatorEndpoint
        ? `${emulatorKind} ${++localEmulatorDisplayIndex} (${adbDevice.serial})`
        : name;
      this.serialByDeviceId.set(id, adbDevice.serial);
      this.deviceStateById.set(id, adbDevice.state);

      const device: Device = {
        id,
        platform: "android",
        name: displayName,
        connectionType: connectionTypeFromSerial(adbDevice.serial),
        capabilities: stateCapabilities(adbDevice.state, resolved.toolStatus.status === "available"),
        tags
      };
      if (osVersion !== undefined) {
        device.osVersion = osVersion;
      }
      devices.push(device);
    }

    return devices;
  }

  async listTargets(deviceId: string): Promise<Target[]> {
    const resolved = await this.ensureAdb();
    if (resolved.client === null) {
      throw new ToolUnavailableError("adb", "adb is required to list Android package targets.", {
        collectorId: this.id,
        deviceId
      });
    }

    const serial = await this.getSerialForDevice(deviceId);
    const state = this.deviceStateById.get(deviceId);
    if (state !== "device") {
      throw new CollectorError("Android device is not authorized and online.", "DEVICE_NOT_READY", {
        collectorId: this.id,
        deviceId
      });
    }

    const packages = await resolved.client.listPackages(serial);
    const targets: Target[] = [];
    for (const androidPackage of packages.slice(0, 500)) {
      const target = packageToTarget(androidPackage);
      try {
        let launcherEntry = this.launcherCache.get(serial, androidPackage.packageName);
        if (launcherEntry === null) {
          const launchers = await resolved.client.getLauncherActivities(serial, androidPackage.packageName);
          this.launcherCache.set(serial, androidPackage.packageName, {
            launcherActivities: launchers,
            hasLauncher: launchers.length > 0,
            warnings: []
          });
          launcherEntry = this.launcherCache.get(serial, androidPackage.packageName);
        }
        if (launcherEntry === null) {
          throw new Error("Launcher cache did not return a stored entry.");
        }
        const launchers = launcherEntry.launcherActivities;
        target.tags = {
          ...(target.tags ?? {}),
          hasLauncher: launchers.length > 0,
          launcherActivityCount: launchers.length,
          launcherCacheUpdatedAt: launcherEntry.updatedAt,
          launcherActivities: launchers.map((launcher) => launcher.componentName).join(","),
          ...(launchers[0]?.componentName === undefined
            ? {}
            : { launcherComponent: launchers[0].componentName })
        };
      } catch {
        target.tags = {
          ...(target.tags ?? {}),
          hasLauncher: "unknown",
          launcherDiscoveryUnavailable: true
        };
      }
      targets.push(target);
    }
    this.targetsByDeviceId.set(deviceId, targets);
    return targets;
  }

  async getForegroundTarget(deviceId: string): Promise<Target> {
    const resolved = await this.ensureAdb();
    if (resolved.client === null) {
      throw new ToolUnavailableError("adb", "adb is required to detect the Android foreground app.", {
        collectorId: this.id,
        deviceId
      });
    }

    const serial = await this.getSerialForDevice(deviceId);
    const state = this.deviceStateById.get(deviceId);
    if (state !== "device") {
      throw new CollectorError("Android device is not authorized and online.", "DEVICE_NOT_READY", {
        collectorId: this.id,
        deviceId
      });
    }

    const foreground = await resolved.client.getForegroundApp(serial);
    if (foreground.packageName === undefined) {
      this.diagnostics.add({
        level: "warn",
        category: "target",
        code: "FOREGROUND_APP_NOT_FOUND",
        message: "Android foreground app package could not be detected.",
        deviceId,
        details: {
          source: foreground.source,
          confidence: foreground.confidence,
          warnings: foreground.warnings
        }
      });
      throw new CollectorError(
        "No foreground Android app was detected. Open the app on the phone, then start the test again.",
        "TARGET_NOT_FOUND",
        {
          collectorId: this.id,
          deviceId
        }
      );
    }

    if (blockedForegroundPackages.has(foreground.packageName)) {
      this.diagnostics.add({
        level: "warn",
        category: "target",
        code: "FOREGROUND_APP_SYSTEM_SCREEN",
        message: "Android foreground screen is a system app, not a test target.",
        deviceId,
        packageName: foreground.packageName,
        details: {
          source: foreground.source,
          confidence: foreground.confidence,
          componentName: foreground.componentName,
          warnings: foreground.warnings
        }
      });
      throw new CollectorError(
        "The phone is currently showing Android Settings or a system screen. Open the app you want to test, then start again.",
        "TARGET_NOT_TEST_APP",
        {
          collectorId: this.id,
          deviceId
        }
      );
    }

    const target: Target = {
      id: `android-package:${foreground.packageName}`,
      name: foreground.packageName,
      type: "app",
      packageName: foreground.packageName,
      platform: "android",
      tags: {
        source: "adb_foreground_app",
        foregroundSource: foreground.source,
        foregroundConfidence: foreground.confidence,
        ...(foreground.activityName === undefined ? {} : { activityName: foreground.activityName }),
        ...(foreground.componentName === undefined ? {} : { componentName: foreground.componentName })
      }
    };
    const existingTargets = this.targetsByDeviceId.get(deviceId) ?? [];
    this.targetsByDeviceId.set(deviceId, [
      target,
      ...existingTargets.filter((candidate) => candidate.id !== target.id)
    ]);
    this.diagnostics.add({
      level: "info",
      category: "target",
      code: "FOREGROUND_APP_DETECTED",
      message: "Android foreground app package was detected for guided start.",
      deviceId,
      targetId: target.id,
      packageName: foreground.packageName,
      details: {
        source: foreground.source,
        confidence: foreground.confidence,
        componentName: foreground.componentName,
        warnings: foreground.warnings
      }
    });
    return target;
  }

  async getCapabilities(deviceId?: string): Promise<MetricAvailability[]> {
    const resolved = await this.ensureAdb();
    if (deviceId !== undefined && this.deviceStateById.has(deviceId)) {
      return stateCapabilities(
        this.deviceStateById.get(deviceId) ?? "unknown",
        resolved.toolStatus.status === "available"
      );
    }
    return cloneCapabilities(getAndroidCapabilities(resolved.toolStatus.status === "available"));
  }

  async getAndroidHealth(deviceId: string): Promise<Record<string, unknown>> {
    const resolved = await this.ensureAdb();
    const serial = this.serialByDeviceId.get(deviceId);
    const state = this.deviceStateById.get(deviceId) ?? "unknown";
    return {
      deviceId,
      adb: {
        status: resolved.toolStatus.status,
        version: resolved.toolStatus.version,
        reason: resolved.toolStatus.reason,
        suggestedAction: resolved.toolStatus.suggestedAction
      },
      device: {
        state,
        authorized: state === "device",
        offline: state === "offline",
        unauthorized: state === "unauthorized"
      },
      cache: {
        launcher: serial === undefined ? [] : this.launcherCache.status(serial),
        deviceInfo: serial === undefined ? [] : this.deviceInfoCache.status(serial)
      },
      knownLimitations: [
        "Android Beta does not use root, logcat, or bugreport by default.",
        "Device-level network counters may include traffic from other apps.",
        "Android FPS probe remains experimental and disabled by default."
      ]
    };
  }

  async getCacheStatus(deviceId?: string): Promise<Record<string, unknown>> {
    const serial = deviceId === undefined ? undefined : await this.getSerialForDevice(deviceId);
    return {
      deviceId,
      launcher: this.launcherCache.status(serial),
      deviceInfo: this.deviceInfoCache.status(serial)
    };
  }

  async refreshCache(deviceId: string): Promise<Record<string, unknown>> {
    const serial = await this.getSerialForDevice(deviceId);
    this.launcherCache.invalidate(serial);
    this.deviceInfoCache.invalidate(serial);
    this.targetsByDeviceId.delete(deviceId);
    await this.discoverDevices();
    return this.getCacheStatus(deviceId);
  }

  async startSession(config: SessionConfig): Promise<Session> {
    const sessionId = config.id ?? `android-session-${Date.now()}`;
    const existing = this.runtimes.get(sessionId);
    if (existing !== undefined && existing.getStatus() === "running") {
      throw new CollectorError("Android session is already running.", "SESSION_ALREADY_RUNNING", {
        collectorId: this.id,
        sessionId
      });
    }

    const resolved = await this.ensureAdb();
    if (resolved.client === null) {
      throw new ToolUnavailableError("adb", "adb is required for Android metric sampling.", {
        collectorId: this.id,
        deviceId: config.deviceId
      });
    }

    const serial = await this.getSerialForDevice(config.deviceId);
    const state = this.deviceStateById.get(config.deviceId);
    if (state !== "device") {
      throw new CollectorError("Android device is not authorized and online.", "DEVICE_NOT_READY", {
        collectorId: this.id,
        deviceId: config.deviceId,
        sessionId
      });
    }

    const target = await this.resolveTarget(config.deviceId, config.targetId);
    if (target.packageName === undefined) {
      throw new CollectorError("Android target does not include a packageName.", "TARGET_NOT_FOUND", {
        collectorId: this.id,
        targetId: config.targetId,
        sessionId
      });
    }

    let pid = await resolved.client.getPid(serial, target.packageName);
    const lifecycle = this.createAppLifecycle({
      adbClient: resolved.client,
      serial,
      packageName: target.packageName,
      deviceId: config.deviceId,
      targetId: config.targetId
    });
    if (pid === null) {
      if (booleanOption(config.options, "autoStartTarget")) {
        const launcherComponent = stringOption(config.options, "launcherComponent");
        const startResult = await lifecycle.startApp({
          ...(launcherComponent === undefined ? {} : { launcherComponent }),
          allowMonkeyFallback: booleanOption(config.options, "allowMonkeyFallback"),
          waitForPid: true
        });
        if (!startResult.ok || startResult.pid === undefined) {
          this.diagnostics.add({
            level: "error",
            category: "lifecycle",
            code: "APP_START_FAILED",
            message: "Android app start failed before session start.",
            sessionId,
            deviceId: config.deviceId,
            targetId: config.targetId,
            packageName: target.packageName,
            details: {
              method: startResult.method,
              warnings: startResult.warnings,
              durationMs: startResult.durationMs
            }
          });
          throw new CollectorError(
            "Target process is not running. Enable autoStartTarget or start the app from the UI.",
            "TARGET_PROCESS_NOT_RUNNING",
            {
              collectorId: this.id,
              deviceId: config.deviceId,
              targetId: config.targetId,
              sessionId
            }
          );
        }
        this.diagnostics.add({
          level: "info",
          category: "lifecycle",
          code: "APP_STARTED",
          message: "Android app was started by LumaTrace before session start.",
          sessionId,
          deviceId: config.deviceId,
          targetId: config.targetId,
          packageName: target.packageName,
          pid: startResult.pid,
          durationMs: startResult.durationMs,
          details: {
            method: startResult.method,
            launcherComponent: startResult.launcherComponent
          }
        });
        pid = startResult.pid;
      } else {
        this.diagnostics.add({
          level: "warn",
          category: "target",
          code: "TARGET_NOT_RUNNING",
          message: "Target process is not running and autoStartTarget is disabled.",
          sessionId,
          deviceId: config.deviceId,
          targetId: config.targetId,
          packageName: target.packageName
        });
        throw new CollectorError(
          "Target process is not running. Enable autoStartTarget or start the app from the UI.",
          "TARGET_PROCESS_NOT_RUNNING",
          {
            collectorId: this.id,
            deviceId: config.deviceId,
            targetId: config.targetId,
            sessionId
          }
        );
      }
    }
    let uid: number | null = null;
    try {
      uid = await resolved.client.getPackageUid(serial, target.packageName);
    } catch {
      uid = null;
    }

    const launcherComponent = stringOption(config.options, "launcherComponent");
    const session: Session = {
      id: sessionId,
      name: config.name,
      deviceId: config.deviceId,
      targetId: config.targetId,
      startedAt: Date.now(),
      sampleIntervalMs: config.sampleIntervalMs,
      status: "running",
      config: {
        ...(config.options ?? {}),
        platform: "android",
        packageName: target.packageName,
        pid,
        ...(uid === null ? {} : { uid }),
        enableExperimentalFps: config.options?.enableExperimentalFps === true,
        enableRealtimeFps: config.options?.enableRealtimeFps === true,
        ...(numberOption(config.options, "fpsSampleIntervalMs") === undefined
          ? {}
          : { fpsSampleIntervalMs: numberOption(config.options, "fpsSampleIntervalMs") }),
        autoStartTarget: booleanOption(config.options, "autoStartTarget"),
        allowMonkeyFallback: booleanOption(config.options, "allowMonkeyFallback"),
        stopTargetOnSessionStop: booleanOption(config.options, "stopTargetOnSessionStop"),
        processMissingPolicy: processMissingPolicyOption(config.options),
        ...(launcherComponent === undefined ? {} : { launcherComponent })
      }
    };
    const processMissingToleranceMs = numberOption(config.options, "processMissingToleranceMs");
    const processRebindTimeoutMs = numberOption(config.options, "processRebindTimeoutMs");
    const fpsSampleIntervalMs = numberOption(config.options, "fpsSampleIntervalMs");
    const runtimeOptions: ConstructorParameters<typeof AndroidSessionRuntime>[0] = {
      session,
      adbClient: resolved.client,
      serial,
      packageName: target.packageName,
      pid,
      ...(uid === null ? {} : { uid }),
      processName: target.packageName,
      appLifecycle: lifecycle,
      stopTargetOnSessionStop: booleanOption(config.options, "stopTargetOnSessionStop"),
      processMissingPolicy: processMissingPolicyOption(config.options),
      diagnostics: this.diagnostics,
      ...(processMissingToleranceMs === undefined ? {} : { processMissingToleranceMs }),
      ...(processRebindTimeoutMs === undefined ? {} : { processRebindTimeoutMs }),
      realtimeFps: config.options?.enableRealtimeFps === true,
      ...(fpsSampleIntervalMs === undefined ? {} : { fpsSampleIntervalMs })
    };
    if (config.options?.enableExperimentalFps === true) {
      const fpsProbe = this.createFpsProbe({
        adbClient: resolved.client,
        context: {
          sessionId,
          deviceId: config.deviceId,
          targetId: config.targetId,
          serial,
          pid,
          packageName: target.packageName,
          sampleIntervalMs: config.sampleIntervalMs,
          nowMs: () => Date.now(),
          monotonicMs: () => Date.now() - (session.startedAt ?? Date.now()),
          nextSequence: () => 0,
          processName: target.packageName
        },
        targetName: target.name
      });
      runtimeOptions.fpsProbe = fpsProbe;
      runtimeOptions.fpsProbePrepareResult = await this.prepareFpsProbe(fpsProbe);
    }
    const runtime = new AndroidSessionRuntime({
      ...runtimeOptions
    });
    this.runtimes.set(session.id, runtime);
    return runtime.getSession();
  }

  async pauseSession(sessionId: string): Promise<void> {
    this.getRuntime(sessionId).pause();
  }

  async stopSession(sessionId: string): Promise<void> {
    const runtime = this.runtimes.get(sessionId);
    if (runtime === undefined) {
      throw new CollectorError("Android session does not exist.", "SESSION_NOT_FOUND", {
        collectorId: this.id,
        sessionId
      });
    }
    runtime.stop();
    const fpsResult = await runtime.finishExperimentalFpsProbe();
    if (fpsResult?.metricEvents !== undefined && fpsResult.metricEvents.length > 0) {
      this.finalMetrics.set(sessionId, fpsResult.metricEvents);
    }
    await runtime.stopTargetIfRequested();
    this.runtimes.delete(sessionId);
  }

  drainFinalMetrics(sessionId: string): MetricEvent[] {
    const events = this.finalMetrics.get(sessionId) ?? [];
    this.finalMetrics.delete(sessionId);
    return events;
  }

  streamMetrics(sessionId: string): AsyncIterable<MetricEvent> {
    return this.getRuntime(sessionId).stream();
  }

  async startApp(
    deviceId: string,
    packageName: string,
    options: AndroidAppStartOptions = {}
  ): Promise<AndroidAppStartResult> {
    const resolved = await this.ensureAdb();
    if (resolved.client === null) {
      throw new ToolUnavailableError("adb", "adb is required to start Android apps.", {
        collectorId: this.id,
        deviceId
      });
    }
    const serial = await this.getSerialForDevice(deviceId);
    const result = await this.createAppLifecycle({
      adbClient: resolved.client,
      serial,
      packageName,
      deviceId,
      targetId: `android-package:${packageName}`
    }).startApp(options);
    this.diagnostics.add({
      level: result.ok ? "info" : "warn",
      category: "lifecycle",
      code: result.ok ? "APP_STARTED" : "APP_START_FAILED",
      message: result.ok ? "Android app start route completed." : "Android app start route failed.",
      deviceId,
      targetId: `android-package:${packageName}`,
      packageName,
      durationMs: result.durationMs,
      ...(result.pid === undefined ? {} : { pid: result.pid }),
      details: {
        method: result.method,
        warnings: result.warnings
      }
    });
    return result;
  }

  async stopApp(
    deviceId: string,
    packageName: string,
    options: AndroidAppStopOptions = {}
  ): Promise<AndroidAppStopResult> {
    const resolved = await this.ensureAdb();
    if (resolved.client === null) {
      throw new ToolUnavailableError("adb", "adb is required to stop Android apps.", {
        collectorId: this.id,
        deviceId
      });
    }
    const serial = await this.getSerialForDevice(deviceId);
    const result = await this.createAppLifecycle({
      adbClient: resolved.client,
      serial,
      packageName,
      deviceId,
      targetId: `android-package:${packageName}`
    }).stopApp(options);
    this.diagnostics.add({
      level: result.ok ? "info" : "warn",
      category: "lifecycle",
      code: "APP_FORCE_STOPPED",
      message: result.ok ? "Android app force-stop route completed." : "Android app force-stop route failed.",
      deviceId,
      targetId: `android-package:${packageName}`,
      packageName,
      durationMs: result.durationMs,
      details: {
        stopped: result.stopped,
        warnings: result.warnings
      }
    });
    return result;
  }

  private async getSerialForDevice(deviceId: string): Promise<string> {
    const existing = this.serialByDeviceId.get(deviceId);
    if (existing !== undefined) {
      return existing;
    }
    await this.discoverDevices();
    const discovered = this.serialByDeviceId.get(deviceId);
    if (discovered === undefined) {
      throw new CollectorError("Android device does not exist.", "DEVICE_NOT_FOUND", {
        collectorId: this.id,
        deviceId
      });
    }
    return discovered;
  }

  private async resolveTarget(deviceId: string, targetId: string): Promise<Target> {
    let targets = this.targetsByDeviceId.get(deviceId);
    if (targets === undefined) {
      targets = await this.listTargets(deviceId);
    }
    const target = targets.find((candidate) => candidate.id === targetId);
    if (target !== undefined) {
      return target;
    }

    const prefix = "android-package:";
    if (targetId.startsWith(prefix)) {
      const packageName = targetId.slice(prefix.length);
      return {
        id: targetId,
        name: packageName,
        type: "app",
        platform: "android",
        packageName,
        tags: {
          source: "adb",
          inferredFromTargetId: true
        }
      };
    }

    throw new CollectorError("Android target does not exist.", "TARGET_NOT_FOUND", {
      collectorId: this.id,
      deviceId,
      targetId
    });
  }

  private getRuntime(sessionId: string): AndroidSessionRuntime {
    const runtime = this.runtimes.get(sessionId);
    if (runtime === undefined) {
      throw new CollectorError("Android session does not exist.", "SESSION_NOT_FOUND", {
        collectorId: this.id,
        sessionId
      });
    }
    return runtime;
  }

  private ensureAdb(): Promise<ResolvedAdb> {
    this.resolvedAdb ??= this.resolveAdb();
    return this.resolvedAdb;
  }

  private createFpsProbe(options: Parameters<NonNullable<AndroidCollectorOptions["fpsProbeFactory"]>>[0]): AndroidFpsProbeLike {
    return this.fpsProbeFactory?.(options) ?? new AndroidFpsProbe(options);
  }

  private createAppLifecycle(options: {
    adbClient: AndroidAdbClientLike;
    serial: string;
    packageName: string;
    deviceId: string;
    targetId: string;
  }): AndroidAppLifecycle {
    return new AndroidAppLifecycle({
      ...options,
      diagnosticsSink: (message, details) => {
        this.diagnostics.add({
          level: "info",
          category: "lifecycle",
          code: "APP_STARTED",
          message,
          deviceId: options.deviceId,
          targetId: options.targetId,
          packageName: options.packageName,
          ...(details === undefined ? {} : { details })
        });
      }
    });
  }

  private async prepareFpsProbe(fpsProbe: AndroidFpsProbeLike) {
    try {
      return await fpsProbe.prepare();
    } catch (error) {
      return {
        status: "failed" as const,
        warnings: [error instanceof Error ? error.message : String(error)],
        availability: getAndroidCapabilities(true).filter(
          (capability) => capability.metricName === "fps" || capability.metricName === "frame_time_ms"
        )
      };
    }
  }

  private async resolveAdb(): Promise<ResolvedAdb> {
    if (this.injectedClient !== undefined) {
      return {
        client: this.injectedClient,
        toolStatus: {
          toolName: "adb",
          status: "available",
          reason: "Injected adb client for tests or controlled runtime.",
          suggestedAction: "Use real adb detection outside tests."
        }
      };
    }

    const found = await findAdb({
      commandRunner: this.commandRunner,
      timeoutMs: 3000,
      maxOutputBytes: 64 * 1024
    });
    if (found.toolStatus.status !== "available" || found.adbPath === undefined) {
      return {
        client: null,
        toolStatus: found.toolStatus
      };
    }

    return {
      client: new AdbClient({
        adbPath: this.adbPath ?? found.adbPath,
        commandRunner: this.commandRunner,
        defaultTimeoutMs: this.defaultTimeoutMs,
        maxOutputBytes: this.maxOutputBytes,
        diagnostics: this.diagnostics,
        autoConnectLocalEmulators: true
      }),
      toolStatus: found.toolStatus
    };
  }
}
