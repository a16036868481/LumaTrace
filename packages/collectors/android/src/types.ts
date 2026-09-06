import type { MetricConfidence, MetricAvailability, Target } from "@lumatrace/core";
import type { AndroidBatteryInfo } from "./parsers/parseBattery";
import type { AndroidMeminfo } from "./parsers/parseMeminfo";
import type { NetstatsUidSnapshot } from "./parsers/parseNetstatsDetail";
import type { ProcPidStatSnapshot } from "./parsers/parseProcPidStat";
import type { ProcNetDevSnapshot } from "./parsers/parseProcNetDev";
import type { ProcStatSnapshot } from "./parsers/parseProcStat";
import type { ProcStatusMemory } from "./parsers/parseProcStatus";
import type { AndroidForegroundAppResult } from "./parsers/parseForegroundApp";
import type { AndroidFpsProbeLike, AndroidFpsProbeOptions } from "./fps/AndroidFpsProbe";
import type {
  AndroidForceStopResult,
  AndroidLauncherActivity,
  AndroidMonkeyLaunchResult,
  AndroidPidWaitResult,
  AndroidStartActivityResult
} from "./lifecycle/AndroidLifecycleTypes";

export type AdbDeviceState = "device" | "offline" | "unauthorized" | "unknown";

export interface AdbVersionInfo {
  version?: string;
  buildVersion?: string;
  installedAs?: string;
}

export interface AndroidAdbDevice {
  serial: string;
  state: AdbDeviceState;
  product?: string;
  model?: string;
  device?: string;
  transportId?: string;
  rawLine: string;
}

export interface AndroidPackage {
  packageName: string;
  apkPath?: string;
  rawLine: string;
}

export interface PackageListParseResult {
  packages: AndroidPackage[];
  warnings: string[];
}

export interface PidofParseResult {
  pid: number | null;
  pids: number[];
}

export interface PsPidResult {
  pid: number | null;
  processName?: string;
  matchType: "exact" | "prefix" | "none";
  confidence: MetricConfidence;
}

export interface PackageUidResult {
  uid: number | null;
  source?: "userId" | "appId" | "uid";
  confidence: MetricConfidence;
}

export interface AndroidDeviceInfo {
  name: string;
  osVersion?: string;
  manufacturer?: string;
  brand?: string;
  abi?: string;
  buildFingerprint?: string;
  sdk?: string;
  tags: Record<string, string | number | boolean>;
}

export interface AndroidCollectorOptions {
  adbPath?: string;
  adbClient?: AndroidAdbClientLike;
  fpsProbeFactory?: (options: AndroidFpsProbeOptions) => AndroidFpsProbeLike;
  defaultTimeoutMs?: number;
  maxOutputBytes?: number;
  capabilities?: MetricAvailability[];
}

export interface AndroidLogcatDumpOptions {
  startedAtMs: number;
  uid?: number;
  pid?: number;
}

export interface AndroidLogcatCommandResult {
  stdout: string;
  stderr: string;
  sanitizedStdout: string;
  sanitizedStderr: string;
  exitCode: number | null;
  timedOut: boolean;
  aborted: boolean;
  stdoutTruncated: boolean;
}

export interface AndroidSessionLogCapture {
  fileName: "android-logcat.log";
  content: string;
  source: "adb:logcat";
  truncated: boolean;
}

export interface AndroidAdbClientLike {
  getVersion(): Promise<AdbVersionInfo>;
  listDevices(): Promise<AndroidAdbDevice[]>;
  getProps(serial: string): Promise<Record<string, string>>;
  getSecureAndroidId?(serial: string): Promise<string | undefined>;
  listPackages(serial: string): Promise<AndroidPackage[]>;
  getPid(serial: string, packageName: string): Promise<number | null>;
  getPackageUid(serial: string, packageName: string): Promise<number | null>;
  readProcStat(serial: string): Promise<ProcStatSnapshot | null>;
  readProcPidStat(serial: string, pid: number): Promise<ProcPidStatSnapshot | null>;
  readProcStatus(serial: string, pid: number): Promise<ProcStatusMemory | null>;
  readMeminfo(serial: string, packageName: string): Promise<AndroidMeminfo>;
  readBattery(serial: string): Promise<AndroidBatteryInfo>;
  readProcNetDev(serial: string): Promise<ProcNetDevSnapshot>;
  readNetstatsDetail(serial: string): Promise<string>;
  readUidNetworkStats(serial: string, uid: number): Promise<NetstatsUidSnapshot | null>;
  readGfxinfoFramestats(serial: string, packageName: string): Promise<string>;
  clearGfxinfoFramestats(serial: string, packageName: string): Promise<void>;
  enableSurfaceFlingerTimestats(serial: string): Promise<void>;
  clearSurfaceFlingerTimestats(serial: string): Promise<void>;
  dumpSurfaceFlingerTimestats(serial: string): Promise<string>;
  disableSurfaceFlingerTimestats(serial: string): Promise<void>;
  dumpSurfaceFlingerLayers(serial: string): Promise<string>;
  readSurfaceFlingerLatency(serial: string, layerName: string): Promise<string>;
  readDisplayRefreshRate(serial: string): Promise<string>;
  getForegroundApp(serial: string): Promise<AndroidForegroundAppResult>;
  getLauncherActivities(serial: string, packageName: string): Promise<AndroidLauncherActivity[]>;
  startActivity(
    serial: string,
    componentName: string,
    options?: { timeoutMs?: number }
  ): Promise<AndroidStartActivityResult>;
  launchPackageWithMonkey(
    serial: string,
    packageName: string,
    options?: { timeoutMs?: number }
  ): Promise<AndroidMonkeyLaunchResult>;
  forceStopPackage(serial: string, packageName: string): Promise<AndroidForceStopResult>;
  waitForPid(
    serial: string,
    packageName: string,
    options?: { timeoutMs?: number; pollIntervalMs?: number }
  ): Promise<AndroidPidWaitResult>;
  dumpLogcat?(
    serial: string,
    options: AndroidLogcatDumpOptions
  ): Promise<AndroidLogcatCommandResult>;
  abortPendingCommands?(): void;
}

export function packageToTarget(androidPackage: AndroidPackage): Target {
  const target: Target = {
    id: `android-package:${androidPackage.packageName}`,
    name: androidPackage.packageName,
    type: "app",
    packageName: androidPackage.packageName,
    platform: "android",
    tags: {
      source: "adb"
    }
  };

  if (androidPackage.apkPath !== undefined) {
    target.executablePath = androidPackage.apkPath;
  }

  return target;
}
