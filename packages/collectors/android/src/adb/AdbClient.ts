import {
  CollectorError,
  CommandRunner,
  type CommandResult,
  type CommandRunnerOptions
} from "@lumatrace/core";
import { existsSync } from "node:fs";
import path from "node:path";
import type {
  AdbVersionInfo,
  AndroidAdbDevice,
  AndroidPackage,
  PackageUidResult,
  PidofParseResult,
  PsPidResult
} from "../types";
import { parseAdbVersion } from "./parseAdbVersion";
import { parseAdbDevices } from "./parseAdbDevices";
import { parseGetProp } from "../parsers/parseGetProp";
import { parsePackageList } from "../parsers/parsePackageList";
import { parsePidof } from "../parsers/parsePidof";
import { parsePsForPackage } from "../parsers/parsePs";
import { parsePackageUid } from "../parsers/parsePackageUid";
import { parseBattery, type AndroidBatteryInfo } from "../parsers/parseBattery";
import { parseMeminfo, type AndroidMeminfo } from "../parsers/parseMeminfo";
import { parseNetstatsDetailForUid, type NetstatsUidSnapshot } from "../parsers/parseNetstatsDetail";
import { parseProcPidStat, type ProcPidStatSnapshot } from "../parsers/parseProcPidStat";
import { parseProcNetDev, type ProcNetDevSnapshot } from "../parsers/parseProcNetDev";
import { parseProcStat, type ProcStatSnapshot } from "../parsers/parseProcStat";
import { parseProcStatus, type ProcStatusMemory } from "../parsers/parseProcStatus";
import { parseAmStart } from "../parsers/parseAmStart";
import { parseDumpsysPackageActivities } from "../parsers/parseDumpsysPackageActivities";
import { parseMonkeyLaunch } from "../parsers/parseMonkeyLaunch";
import { parseForegroundApp } from "../parsers/parseForegroundApp";
import { createPidWaitResult } from "../parsers/parsePidWait";
import type { AndroidForegroundAppResult } from "../parsers/parseForegroundApp";
import type {
  AndroidForceStopResult,
  AndroidLauncherActivity,
  AndroidMonkeyLaunchResult,
  AndroidPidWaitResult,
  AndroidStartActivityResult
} from "../lifecycle/AndroidLifecycleTypes";
import type { AndroidDiagnosticCollector } from "../diagnostics/AndroidDiagnosticCollector";
import { runAndroidCommandWithPolicy, type AndroidCommandPolicyName } from "./AndroidCommandPolicy";
import { ADB_COMMANDS, serialArgs } from "./adbCommands";
import { discoverReachableLocalAndroidEmulatorSerials } from "./LocalAndroidEmulatorDiscovery";

export interface CommandRunnerLike {
  run(options: CommandRunnerOptions): Promise<CommandResult>;
}

export interface AdbClientOptions {
  adbPath?: string;
  commandRunner?: CommandRunnerLike;
  defaultTimeoutMs?: number;
  maxOutputBytes?: number;
  diagnostics?: AndroidDiagnosticCollector;
  autoConnectLocalEmulators?: boolean;
  localEmulatorPorts?: readonly number[];
  localPortProbeTimeoutMs?: number;
  localEmulatorPortProbe?: (port: number, timeoutMs: number) => Promise<boolean>;
}

const PACKAGE_NAME_PATTERN = /^[A-Za-z0-9_.]+$/u;
const COMPONENT_NAME_PATTERN = /^[A-Za-z0-9_.]+\/(?:\.[A-Za-z0-9_.$]+|[A-Za-z][A-Za-z0-9_.$]+)$/u;

export function resolveDefaultAdbPath(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  exists: (filePath: string) => boolean = existsSync
): string {
  const explicitPath = env.LUMATRACE_ADB_PATH?.trim();
  if (explicitPath !== undefined && explicitPath.length > 0) {
    return explicitPath;
  }

  const executableName = platform === "win32" ? "adb.exe" : "adb";
  const sdkRoots = [env.ANDROID_HOME, env.ANDROID_SDK_ROOT]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());

  for (const sdkRoot of sdkRoots) {
    const candidate = path.join(sdkRoot, "platform-tools", executableName);
    if (exists(candidate)) {
      return candidate;
    }
  }

  return "adb";
}

function assertValidPackageName(packageName: string): void {
  if (!PACKAGE_NAME_PATTERN.test(packageName) || packageName.includes("..")) {
    throw new CollectorError("Invalid Android package name.", "INVALID_REQUEST", {
      collectorId: "android-adb",
      targetId: packageName
    });
  }
}

function assertValidPid(pid: number): void {
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new CollectorError("Invalid Android process id.", "INVALID_REQUEST", {
      collectorId: "android-adb"
    });
  }
}

function assertValidUid(uid: number): void {
  if (!Number.isInteger(uid) || uid <= 0) {
    throw new CollectorError("Invalid Android package uid.", "INVALID_REQUEST", {
      collectorId: "android-adb"
    });
  }
}

function assertValidComponentName(componentName: string): void {
  if (
    !COMPONENT_NAME_PATTERN.test(componentName) ||
    /[\s;&|`$<>]/u.test(componentName) ||
    componentName.includes("..")
  ) {
    throw new CollectorError("Invalid Android component name.", "INVALID_REQUEST", {
      collectorId: "android-adb",
      targetId: componentName
    });
  }
}

function assertValidSurfaceLayerName(layerName: string): void {
  const hasControlCharacter = Array.from(layerName).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
  if (
    layerName.trim().length === 0 ||
    layerName.length > 512 ||
    hasControlCharacter
  ) {
    throw new CollectorError("Invalid Android SurfaceFlinger layer name.", "INVALID_REQUEST", {
      collectorId: "android-adb"
    });
  }
}

function assertCommandSuccess(result: CommandResult, action: string): void {
  if (result.exitCode !== 0) {
    throw new CollectorError(`${action} failed.`, "COLLECTOR_ERROR", {
      collectorId: "android-adb"
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class AdbClient {
  private readonly adbPath: string;
  private readonly commandRunner: CommandRunnerLike;
  private readonly defaultTimeoutMs: number;
  private readonly maxOutputBytes: number;
  private readonly diagnostics: AndroidDiagnosticCollector | undefined;
  private readonly autoConnectLocalEmulators: boolean;
  private readonly localEmulatorPorts: readonly number[] | undefined;
  private readonly localPortProbeTimeoutMs: number;
  private readonly localEmulatorPortProbe: ((port: number, timeoutMs: number) => Promise<boolean>) | undefined;
  private readonly pendingAbortControllers = new Set<AbortController>();
  private readonly deviceStates = new Map<string, AndroidAdbDevice["state"]>();

  constructor(options: AdbClientOptions = {}) {
    this.adbPath = options.adbPath ?? resolveDefaultAdbPath();
    this.commandRunner = options.commandRunner ?? new CommandRunner();
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 5000;
    this.maxOutputBytes = options.maxOutputBytes ?? 1024 * 1024;
    this.diagnostics = options.diagnostics;
    this.autoConnectLocalEmulators = options.autoConnectLocalEmulators ?? false;
    this.localEmulatorPorts = options.localEmulatorPorts;
    this.localPortProbeTimeoutMs = options.localPortProbeTimeoutMs ?? 150;
    this.localEmulatorPortProbe = options.localEmulatorPortProbe;
  }

  async getVersion(): Promise<AdbVersionInfo> {
    const result = await this.run(ADB_COMMANDS.VERSION, { policyName: "adb_version" });
    assertCommandSuccess(result, "adb version");
    return parseAdbVersion(result.stdout);
  }

  async listDevices(): Promise<AndroidAdbDevice[]> {
    if (this.autoConnectLocalEmulators) {
      await this.connectReachableLocalEmulators();
    }
    const result = await this.run(ADB_COMMANDS.DEVICES_LONG, { policyName: "adb_devices" });
    assertCommandSuccess(result, "adb devices");
    const devices = parseAdbDevices(result.stdout);
    this.deviceStates.clear();
    for (const device of devices) {
      this.deviceStates.set(device.serial, device.state);
    }
    return devices;
  }

  async shell(
    serial: string,
    args: string[],
    options: { timeoutMs?: number; maxOutputBytes?: number } = {}
  ): Promise<CommandResult> {
    this.assertDeviceReady(serial);
    return this.run(serialArgs(serial, ["shell", ...args]), options);
  }

  async getProps(serial: string): Promise<Record<string, string>> {
    this.assertDeviceReady(serial);
    const result = await this.run(serialArgs(serial, ADB_COMMANDS.GETPROP), {
      policyName: "getprop"
    });
    assertCommandSuccess(result, "adb shell getprop");
    return parseGetProp(result.stdout);
  }

  async getSecureAndroidId(serial: string): Promise<string | undefined> {
    this.assertDeviceReady(serial);
    const result = await this.run(serialArgs(serial, ["shell", "settings", "get", "secure", "android_id"]), {
      timeoutMs: 3000,
      maxOutputBytes: 16 * 1024,
      policyName: "getprop"
    });
    if (result.exitCode !== 0) {
      return undefined;
    }
    const androidId = result.stdout.trim();
    if (androidId.length === 0 || androidId === "null" || androidId === "unknown") {
      return undefined;
    }
    return androidId;
  }

  async listPackages(serial: string): Promise<AndroidPackage[]> {
    this.assertDeviceReady(serial);
    const result = await this.run(serialArgs(serial, ADB_COMMANDS.LIST_PACKAGES), {
      policyName: "pm_list_packages"
    });
    assertCommandSuccess(result, "adb shell pm list packages");
    return parsePackageList(result.stdout).packages;
  }

  async getPid(serial: string, packageName: string): Promise<number | null> {
    assertValidPackageName(packageName);
    this.assertDeviceReady(serial);
    const pidofResult = await this.run(serialArgs(serial, [...ADB_COMMANDS.PIDOF, packageName]), {
      policyName: "proc_pid_stat"
    });
    const parsedPidof: PidofParseResult = parsePidof(pidofResult.stdout);
    if (pidofResult.exitCode === 0 && parsedPidof.pid !== null) {
      return parsedPidof.pid;
    }

    const psResult = await this.run(serialArgs(serial, ADB_COMMANDS.PS_A), {
      policyName: "proc_pid_stat"
    });
    let parsedPs: PsPidResult = parsePsForPackage(psResult.stdout, packageName);
    if (parsedPs.pid !== null) {
      return parsedPs.pid;
    }

    const fallbackPsResult = await this.run(serialArgs(serial, ADB_COMMANDS.PS), {
      policyName: "proc_pid_stat"
    });
    parsedPs = parsePsForPackage(fallbackPsResult.stdout, packageName);
    return parsedPs.pid;
  }

  async getPackageUid(serial: string, packageName: string): Promise<number | null> {
    assertValidPackageName(packageName);
    this.assertDeviceReady(serial);
    const result = await this.run(serialArgs(serial, [...ADB_COMMANDS.DUMPSYS_PACKAGE, packageName]), {
      policyName: "dumpsys_package",
      maxOutputBytes: this.maxOutputBytes
    });
    assertCommandSuccess(result, "adb shell dumpsys package");
    const parsed: PackageUidResult = parsePackageUid(result.stdout);
    return parsed.uid;
  }

  async readProcStat(serial: string): Promise<ProcStatSnapshot | null> {
    this.assertDeviceReady(serial);
    const result = await this.run(serialArgs(serial, ["shell", "cat", "/proc/stat"]), {
      timeoutMs: 2000,
      maxOutputBytes: 128 * 1024,
      policyName: "proc_stat"
    });
    assertCommandSuccess(result, "adb shell cat /proc/stat");
    return parseProcStat(result.stdout);
  }

  async readProcPidStat(serial: string, pid: number): Promise<ProcPidStatSnapshot | null> {
    assertValidPid(pid);
    this.assertDeviceReady(serial);
    const result = await this.run(serialArgs(serial, ["shell", "cat", `/proc/${pid}/stat`]), {
      timeoutMs: 2000,
      maxOutputBytes: 128 * 1024,
      policyName: "proc_pid_stat"
    });
    assertCommandSuccess(result, "adb shell cat /proc/<pid>/stat");
    return parseProcPidStat(result.stdout);
  }

  async readProcStatus(serial: string, pid: number): Promise<ProcStatusMemory | null> {
    assertValidPid(pid);
    this.assertDeviceReady(serial);
    const result = await this.run(serialArgs(serial, ["shell", "cat", `/proc/${pid}/status`]), {
      timeoutMs: 2000,
      maxOutputBytes: 128 * 1024,
      policyName: "proc_pid_status"
    });
    assertCommandSuccess(result, "adb shell cat /proc/<pid>/status");
    return parseProcStatus(result.stdout);
  }

  async readMeminfo(serial: string, packageName: string): Promise<AndroidMeminfo> {
    assertValidPackageName(packageName);
    this.assertDeviceReady(serial);
    const result = await this.run(serialArgs(serial, ["shell", "dumpsys", "meminfo", packageName]), {
      timeoutMs: 5000,
      maxOutputBytes: 2 * 1024 * 1024,
      policyName: "dumpsys_meminfo"
    });
    assertCommandSuccess(result, "adb shell dumpsys meminfo");
    return parseMeminfo(result.stdout);
  }

  async readBattery(serial: string): Promise<AndroidBatteryInfo> {
    this.assertDeviceReady(serial);
    const result = await this.run(serialArgs(serial, ["shell", "dumpsys", "battery"]), {
      timeoutMs: 3000,
      maxOutputBytes: 256 * 1024,
      policyName: "dumpsys_battery"
    });
    assertCommandSuccess(result, "adb shell dumpsys battery");
    return parseBattery(result.stdout);
  }

  async readProcNetDev(serial: string): Promise<ProcNetDevSnapshot> {
    this.assertDeviceReady(serial);
    const result = await this.run(serialArgs(serial, ["shell", "cat", "/proc/net/dev"]), {
      timeoutMs: 2000,
      maxOutputBytes: 256 * 1024,
      policyName: "proc_net_dev"
    });
    assertCommandSuccess(result, "adb shell cat /proc/net/dev");
    return parseProcNetDev(result.stdout);
  }

  async readNetstatsDetail(serial: string): Promise<string> {
    this.assertDeviceReady(serial);
    const result = await this.run(serialArgs(serial, ["shell", "dumpsys", "netstats", "detail"]), {
      timeoutMs: 8000,
      maxOutputBytes: 5 * 1024 * 1024,
      policyName: "dumpsys_netstats_detail"
    });
    assertCommandSuccess(result, "adb shell dumpsys netstats detail");
    return result.stdout;
  }

  async readUidNetworkStats(serial: string, uid: number): Promise<NetstatsUidSnapshot | null> {
    assertValidUid(uid);
    return parseNetstatsDetailForUid(await this.readNetstatsDetail(serial), uid);
  }

  async readGfxinfoFramestats(serial: string, packageName: string): Promise<string> {
    assertValidPackageName(packageName);
    this.assertDeviceReady(serial);
    const result = await this.run(
      serialArgs(serial, ["shell", "dumpsys", "gfxinfo", packageName, "framestats"]),
      {
        timeoutMs: 5000,
        maxOutputBytes: 3 * 1024 * 1024,
        policyName: "gfxinfo"
      }
    );
    assertCommandSuccess(result, "adb shell dumpsys gfxinfo framestats");
    return result.stdout;
  }

  async clearGfxinfoFramestats(serial: string, packageName: string): Promise<void> {
    assertValidPackageName(packageName);
    this.assertDeviceReady(serial);
    const result = await this.run(
      serialArgs(serial, ["shell", "dumpsys", "gfxinfo", packageName, "reset"]),
      {
        timeoutMs: 5000,
        maxOutputBytes: 128 * 1024,
        policyName: "gfxinfo"
      }
    );
    assertCommandSuccess(result, "adb shell dumpsys gfxinfo reset");
  }

  async enableSurfaceFlingerTimestats(serial: string): Promise<void> {
    this.assertDeviceReady(serial);
    const result = await this.run(
      serialArgs(serial, ["shell", "dumpsys", "SurfaceFlinger", "--timestats", "-clear", "-enable"]),
      {
        timeoutMs: 3000,
        maxOutputBytes: 128 * 1024,
        policyName: "surfaceflinger_timestats"
      }
    );
    assertCommandSuccess(result, "adb shell dumpsys SurfaceFlinger --timestats -clear -enable");
  }

  async clearSurfaceFlingerTimestats(serial: string): Promise<void> {
    this.assertDeviceReady(serial);
    const result = await this.run(
      serialArgs(serial, ["shell", "dumpsys", "SurfaceFlinger", "--timestats", "-clear"]),
      {
        timeoutMs: 3000,
        maxOutputBytes: 128 * 1024,
        policyName: "surfaceflinger_timestats"
      }
    );
    assertCommandSuccess(result, "adb shell dumpsys SurfaceFlinger --timestats -clear");
  }

  async dumpSurfaceFlingerTimestats(serial: string): Promise<string> {
    this.assertDeviceReady(serial);
    const result = await this.run(
      serialArgs(serial, ["shell", "dumpsys", "SurfaceFlinger", "--timestats", "-dump"]),
      {
        timeoutMs: 8000,
        maxOutputBytes: 10 * 1024 * 1024,
        policyName: "surfaceflinger_timestats"
      }
    );
    assertCommandSuccess(result, "adb shell dumpsys SurfaceFlinger --timestats -dump");
    return result.stdout;
  }

  async disableSurfaceFlingerTimestats(serial: string): Promise<void> {
    this.assertDeviceReady(serial);
    const result = await this.run(
      serialArgs(serial, ["shell", "dumpsys", "SurfaceFlinger", "--timestats", "-disable"]),
      {
        timeoutMs: 3000,
        maxOutputBytes: 128 * 1024,
        policyName: "surfaceflinger_timestats"
      }
    );
    assertCommandSuccess(result, "adb shell dumpsys SurfaceFlinger --timestats -disable");
  }

  async dumpSurfaceFlingerLayers(serial: string): Promise<string> {
    this.assertDeviceReady(serial);
    const result = await this.run(serialArgs(serial, ["shell", "dumpsys", "SurfaceFlinger", "--list"]), {
      timeoutMs: 8000,
      maxOutputBytes: 5 * 1024 * 1024,
      policyName: "surfaceflinger_layers"
    });
    assertCommandSuccess(result, "adb shell dumpsys SurfaceFlinger --list");
    return result.stdout;
  }

  async readSurfaceFlingerLatency(serial: string, layerName: string): Promise<string> {
    assertValidSurfaceLayerName(layerName);
    this.assertDeviceReady(serial);
    const result = await this.run(
      serialArgs(serial, ["exec-out", "dumpsys", "SurfaceFlinger", "--latency", layerName]),
      {
        timeoutMs: 5000,
        maxOutputBytes: 512 * 1024,
        policyName: "surfaceflinger_latency"
      }
    );
    assertCommandSuccess(result, "adb exec-out dumpsys SurfaceFlinger --latency");
    return result.stdout;
  }

  async readDisplayRefreshRate(serial: string): Promise<string> {
    this.assertDeviceReady(serial);
    const result = await this.run(serialArgs(serial, ["shell", "dumpsys", "display"]), {
      timeoutMs: 5000,
      maxOutputBytes: 2 * 1024 * 1024,
      policyName: "display"
    });
    assertCommandSuccess(result, "adb shell dumpsys display");
    return result.stdout;
  }

  async getForegroundApp(serial: string): Promise<AndroidForegroundAppResult> {
    this.assertDeviceReady(serial);
      const warnings: string[] = [];
      const commands: Array<{ args: string[]; label: string; timeoutMs: number; maxOutputBytes: number }> = [
        {
          args: ["shell", "dumpsys", "activity", "activities"],
          label: "dumpsys activity activities",
          timeoutMs: 5000,
          maxOutputBytes: 2 * 1024 * 1024
        },
        {
          args: ["shell", "dumpsys", "activity", "top"],
          label: "dumpsys activity top",
          timeoutMs: 5000,
          maxOutputBytes: 512 * 1024
        },
      {
        args: ["shell", "dumpsys", "window"],
        label: "dumpsys window",
        timeoutMs: 5000,
        maxOutputBytes: 512 * 1024
      }
    ];

    for (const command of commands) {
      const result = await this.run(serialArgs(serial, command.args), {
        timeoutMs: command.timeoutMs,
        maxOutputBytes: command.maxOutputBytes,
        policyName: "dumpsys_package"
      });
      if (result.exitCode !== 0) {
        warnings.push(`${command.label} returned a non-zero exit code.`);
        continue;
      }
      const parsed = parseForegroundApp(result.stdout);
      if (parsed.packageName !== undefined) {
        return {
          ...parsed,
          warnings: [...warnings, ...parsed.warnings]
        };
      }
      warnings.push(...parsed.warnings);
    }

    return {
      source: "unknown",
      confidence: "low",
      warnings: warnings.length === 0 ? ["No foreground Android app package could be parsed."] : warnings
    };
  }

  async getLauncherActivities(serial: string, packageName: string): Promise<AndroidLauncherActivity[]> {
    assertValidPackageName(packageName);
    this.assertDeviceReady(serial);
    const result = await this.run(serialArgs(serial, ["shell", "dumpsys", "package", packageName]), {
      timeoutMs: 5000,
      maxOutputBytes: 3 * 1024 * 1024,
      policyName: "dumpsys_package"
    });
    assertCommandSuccess(result, "adb shell dumpsys package");
    return parseDumpsysPackageActivities(result.stdout, { packageName }).activities;
  }

  async startActivity(serial: string, componentName: string): Promise<AndroidStartActivityResult> {
    assertValidComponentName(componentName);
    this.assertDeviceReady(serial);
    const result = await this.run(serialArgs(serial, ["shell", "am", "start", "-W", "-n", componentName]), {
      timeoutMs: 15000,
      maxOutputBytes: 256 * 1024,
      policyName: "am_start"
    });
    const parsed = parseAmStart([result.stdout, result.stderr].filter((part) => part.length > 0).join("\n"));
    if (result.exitCode !== 0 && parsed.warnings.length === 0) {
      parsed.warnings.push("adb shell am start returned a non-zero exit code.");
    }
    return parsed;
  }

  async launchPackageWithMonkey(serial: string, packageName: string): Promise<AndroidMonkeyLaunchResult> {
    assertValidPackageName(packageName);
    this.assertDeviceReady(serial);
    const result = await this.run(serialArgs(serial, ["shell", "monkey", "-p", packageName, "1"]), {
      timeoutMs: 10000,
      maxOutputBytes: 256 * 1024,
      policyName: "monkey"
    });
    const parsed = parseMonkeyLaunch([result.stdout, result.stderr].filter((part) => part.length > 0).join("\n"));
    if (result.exitCode !== 0 && parsed.warnings.length === 0) {
      parsed.warnings.push("adb shell monkey returned a non-zero exit code.");
    }
    return parsed;
  }

  async forceStopPackage(serial: string, packageName: string): Promise<AndroidForceStopResult> {
    assertValidPackageName(packageName);
    this.assertDeviceReady(serial);
    const result = await this.run(serialArgs(serial, ["shell", "am", "force-stop", packageName]), {
      timeoutMs: 5000,
      maxOutputBytes: 128 * 1024,
      policyName: "force_stop"
    });
    const rawOutput = [result.stdout, result.stderr].filter((part) => part.length > 0).join("\n");
    return {
      ok: result.exitCode === 0,
      method: "am_force_stop",
      durationMs: result.durationMs,
      warnings: result.exitCode === 0 ? [] : ["adb shell am force-stop returned a non-zero exit code."],
      rawOutput
    };
  }

  async waitForPid(
    serial: string,
    packageName: string,
    options: { timeoutMs?: number; pollIntervalMs?: number } = {}
  ): Promise<AndroidPidWaitResult> {
    assertValidPackageName(packageName);
    this.assertDeviceReady(serial);
    const timeoutMs = options.timeoutMs ?? 10000;
    const pollIntervalMs = options.pollIntervalMs ?? 250;
    const startedAt = Date.now();
    const deadline = startedAt + timeoutMs;
    let attempts = 0;
    while (Date.now() <= deadline) {
      attempts += 1;
      const pid = await this.getPid(serial, packageName);
      if (pid !== null) {
        return createPidWaitResult({
          pid,
          attempts,
          durationMs: Date.now() - startedAt
        });
      }
      await sleep(pollIntervalMs);
    }
    return createPidWaitResult({
      pid: null,
      attempts,
      durationMs: Date.now() - startedAt,
      reason: "Timed out waiting for target PID."
    });
  }

  private assertDeviceReady(serial: string): void {
    const state = this.deviceStates.get(serial);
    if (state !== undefined && state !== "device") {
      throw new CollectorError(`Android device is ${state}.`, "DEVICE_NOT_READY", {
        collectorId: "android-adb"
      });
    }
  }

  private async connectReachableLocalEmulators(): Promise<void> {
    let serials: string[];
    try {
      serials = await discoverReachableLocalAndroidEmulatorSerials({
        ...(this.localEmulatorPorts === undefined ? {} : { ports: this.localEmulatorPorts }),
        portProbeTimeoutMs: this.localPortProbeTimeoutMs,
        ...(this.localEmulatorPortProbe === undefined ? {} : { isPortOpen: this.localEmulatorPortProbe })
      });
    } catch {
      return;
    }

    await Promise.all(
      serials.map(async (serial) => {
        try {
          const result = await this.run(["connect", serial], {
            timeoutMs: 3000,
            maxOutputBytes: 64 * 1024,
            policyName: "default"
          });
          const output = `${result.stdout}\n${result.stderr}`.toLowerCase();
          if (result.exitCode === 0 && (output.includes("connected") || output.includes("already connected"))) {
            this.diagnostics?.add({
              level: "info",
              category: "adb",
              code: "ADB_LOCAL_EMULATOR_CONNECTED",
              message: "Connected to a local Android emulator endpoint.",
              durationMs: result.durationMs,
              details: {
                endpoint: serial,
                source: "local_tcp_probe"
              }
            });
          }
        } catch {
          // Local emulator auto-connect is best effort and must not block normal adb discovery.
        }
      })
    );
  }

  abortPendingCommands(): void {
    for (const controller of this.pendingAbortControllers) {
      controller.abort();
    }
    this.pendingAbortControllers.clear();
  }

  private async run(
    args: readonly string[],
    options: { timeoutMs?: number; maxOutputBytes?: number; policyName?: AndroidCommandPolicyName } = {}
  ): Promise<CommandResult> {
    const serialIndex = args.indexOf("-s");
    const serial = serialIndex >= 0 ? args[serialIndex + 1] : undefined;
    const sensitiveValues = serial === undefined ? [] : [serial];
    const controller = new AbortController();
    this.pendingAbortControllers.add(controller);
    try {
      const runOptions = {
        command: this.adbPath,
        args,
        timeoutMs: options.timeoutMs ?? this.defaultTimeoutMs,
        maxOutputBytes: options.maxOutputBytes ?? this.maxOutputBytes,
        signal: controller.signal,
        sensitiveValues,
        ...(options.policyName === undefined ? {} : { policyName: options.policyName }),
        ...(this.diagnostics === undefined ? {} : { diagnostics: this.diagnostics })
      };
      return await runAndroidCommandWithPolicy(this.commandRunner, runOptions);
    } finally {
      this.pendingAbortControllers.delete(controller);
    }
  }
}
