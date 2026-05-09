import type { AndroidAdbClientLike } from "../types";
import type {
  AndroidAppStartOptions,
  AndroidAppStartResult,
  AndroidAppStopOptions,
  AndroidAppStopResult,
  AndroidLauncherActivity,
  AndroidPidWaitResult
} from "./AndroidLifecycleTypes";

export interface AndroidAppLifecycleOptions {
  adbClient: AndroidAdbClientLike;
  serial: string;
  packageName: string;
  targetId?: string;
  deviceId?: string;
  diagnosticsSink?: (message: string, details?: Record<string, unknown>) => void;
}

function now(): number {
  return Date.now();
}

function durationSince(startedAt: number): number {
  return Math.max(0, now() - startedAt);
}

function warningMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class AndroidAppLifecycle {
  private readonly adbClient: AndroidAdbClientLike;
  private readonly serial: string;
  private readonly packageName: string;
  private readonly targetId: string | undefined;
  private readonly deviceId: string | undefined;
  private readonly diagnosticsSink: AndroidAppLifecycleOptions["diagnosticsSink"];

  constructor(options: AndroidAppLifecycleOptions) {
    this.adbClient = options.adbClient;
    this.serial = options.serial;
    this.packageName = options.packageName;
    this.targetId = options.targetId;
    this.deviceId = options.deviceId;
    this.diagnosticsSink = options.diagnosticsSink;
  }

  async getLaunchers(): Promise<AndroidLauncherActivity[]> {
    return this.adbClient.getLauncherActivities(this.serial, this.packageName);
  }

  async waitForRunningProcess(options: {
    timeoutMs?: number;
    pollIntervalMs?: number;
  } = {}): Promise<AndroidPidWaitResult> {
    return this.adbClient.waitForPid(this.serial, this.packageName, options);
  }

  async startApp(options: AndroidAppStartOptions = {}): Promise<AndroidAppStartResult> {
    const startedAt = now();
    const warnings: string[] = [];
    const diagnostics: string[] = [];
    const waitForPid = options.waitForPid ?? true;

    const lifecycleDetails = {
      packageName: this.packageName,
      targetId: this.targetId,
      deviceId: this.deviceId
    };

    try {
      let launcherComponent = options.launcherComponent;
      if (launcherComponent === undefined) {
        const launchers = await this.getLaunchers();
        launcherComponent = launchers[0]?.componentName;
        if (launchers.length > 1) {
          warnings.push("Multiple launcher activities were found; using the first parsed launcher.");
        }
      }

      if (launcherComponent !== undefined) {
        const startActivityResult = await this.adbClient.startActivity(this.serial, launcherComponent);
        warnings.push(...startActivityResult.warnings);
        let pid: number | undefined;
        if (startActivityResult.ok && waitForPid) {
          const waitResult = await this.waitForRunningProcess({
            timeoutMs: options.waitTimeoutMs ?? 10000,
            pollIntervalMs: options.pollIntervalMs ?? 250
          });
          if (waitResult.pid !== undefined) {
            pid = waitResult.pid;
          } else {
            warnings.push(waitResult.reason ?? "Timed out waiting for target PID after am start.");
          }
        }
        const ok = startActivityResult.ok && (!waitForPid || pid !== undefined);
        if (ok) {
          diagnostics.push("Android app start completed with am start -W.");
          this.diagnosticsSink?.("Android app start completed.", {
            ...lifecycleDetails,
            method: "am_start",
            launcherComponent,
            durationMs: durationSince(startedAt)
          });
        }
        return {
          ok,
          method: "am_start",
          launcherComponent,
          ...(pid === undefined ? {} : { pid }),
          startActivityResult,
          durationMs: durationSince(startedAt),
          warnings,
          diagnostics
        };
      }

      warnings.push("No launcher activity was found for the target package.");
      if (options.allowMonkeyFallback !== true) {
        warnings.push("Monkey fallback is disabled.");
        return {
          ok: false,
          method: "none",
          durationMs: durationSince(startedAt),
          warnings,
          diagnostics
        };
      }

      const monkeyResult = await this.adbClient.launchPackageWithMonkey(this.serial, this.packageName);
      warnings.push(...monkeyResult.warnings);
      let pid: number | undefined;
      if (monkeyResult.ok && waitForPid) {
        const waitResult = await this.waitForRunningProcess({
          timeoutMs: options.waitTimeoutMs ?? 10000,
          pollIntervalMs: options.pollIntervalMs ?? 250
        });
        if (waitResult.pid !== undefined) {
          pid = waitResult.pid;
        } else {
          warnings.push(waitResult.reason ?? "Timed out waiting for target PID after monkey launch.");
        }
      }
      const ok = monkeyResult.ok && (!waitForPid || pid !== undefined);
      if (ok) {
        diagnostics.push("Android app start completed with monkey fallback.");
        this.diagnosticsSink?.("Android app start completed.", {
          ...lifecycleDetails,
          method: "monkey",
          durationMs: durationSince(startedAt)
        });
      }
      return {
        ok,
        method: "monkey",
        ...(pid === undefined ? {} : { pid }),
        monkeyResult,
        durationMs: durationSince(startedAt),
        warnings,
        diagnostics
      };
    } catch (error) {
      warnings.push(warningMessage(error));
      return {
        ok: false,
        method: "none",
        durationMs: durationSince(startedAt),
        warnings,
        diagnostics
      };
    }
  }

  async stopApp(options: AndroidAppStopOptions = {}): Promise<AndroidAppStopResult> {
    const startedAt = now();
    const warnings: string[] = [];
    const diagnostics: string[] = [];
    const waitUntilStopped = options.waitUntilStopped ?? true;

    try {
      const forceStopResult = await this.adbClient.forceStopPackage(this.serial, this.packageName);
      warnings.push(...forceStopResult.warnings);
      let stopped: boolean | undefined;
      if (forceStopResult.ok && waitUntilStopped) {
        const timeoutMs = options.waitTimeoutMs ?? 5000;
        const pollIntervalMs = options.pollIntervalMs ?? 250;
        const deadline = now() + timeoutMs;
        stopped = false;
        while (now() <= deadline) {
          const pid = await this.adbClient.getPid(this.serial, this.packageName);
          if (pid === null) {
            stopped = true;
            break;
          }
          await sleep(pollIntervalMs);
        }
        if (!stopped) {
          warnings.push("Timed out waiting for target PID to disappear after force-stop.");
        }
      }
      if (forceStopResult.ok) {
        diagnostics.push("Android app force-stop completed.");
        this.diagnosticsSink?.("Android app force-stop completed.", {
          packageName: this.packageName,
          targetId: this.targetId,
          deviceId: this.deviceId,
          durationMs: durationSince(startedAt)
        });
      }
      return {
        ok: forceStopResult.ok,
        method: "am_force_stop",
        durationMs: durationSince(startedAt),
        ...(stopped === undefined ? {} : { stopped }),
        warnings,
        diagnostics,
        forceStopResult
      };
    } catch (error) {
      warnings.push(warningMessage(error));
      return {
        ok: false,
        method: "am_force_stop",
        durationMs: durationSince(startedAt),
        warnings,
        diagnostics
      };
    }
  }
}
