import os from "node:os";
import {
  CollectorError,
  CommandRunner,
  type Device,
  type MetricAvailability,
  type MetricEvent,
  type MetricCollector,
  type Platform,
  type Session,
  type SessionConfig,
  type Target,
  type ToolStatus
} from "@lumatrace/core";
import { getPcCapabilities } from "./availability/pcCapabilities";
import { PcDiagnosticsTimeline } from "./diagnostics/PcDiagnosticsTimeline";
import type { PcDiagnosticEvent, PcDiagnosticsListOptions, PcDiagnosticsSummary } from "./diagnostics/PcDiagnosticEvent";
import { PresentMonTool } from "./windows/PresentMonTool";
import {
  PresentMonCaptureRuntime,
  type PresentMonCaptureResult,
  type PresentMonSessionCaptureOptions
} from "./windows/PresentMonCaptureRuntime";
import type { PresentMonCaptureStatusSnapshot } from "./windows/PresentMonCaptureStatus";
import { WindowsProcessList } from "./windows/WindowsProcessList";
import { WindowsProcessSampler } from "./windows/WindowsProcessSampler";
import { WindowsProcessWatcher } from "./windows/WindowsProcessWatcher";
import {
  processRuntimeId,
  processToTarget,
  type PcCollectorOptions,
  type PresentMonCaptureRuntimeFactory,
  type PresentMonCaptureRuntimeLike,
  type WindowsProcessAdapter,
  type WindowsProcessInfo
} from "./types";

function platformFromNodePlatform(platform: NodeJS.Platform): Platform {
  if (platform === "win32") {
    return "windows";
  }
  if (platform === "darwin") {
    return "macos";
  }
  return "linux";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function targetPidFromId(targetId: string): number | null {
  const match = /^pc-windows-process:(\d+):/.exec(targetId);
  if (match === null) {
    return null;
  }
  const pid = Number(match[1]);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

interface PcRuntimeOptions {
  session: Session;
  adapter: WindowsProcessAdapter;
  process: WindowsProcessInfo;
  processorCount: number;
  diagnostics: PcDiagnosticsTimeline;
  allowProcessRebindByName?: boolean;
  presentMonRuntime?: PresentMonCaptureRuntimeLike;
  presentMonCaptureDurationMs?: number;
  presentMonTargetMode?: "pid" | "process_name";
  presentMonOutputDir?: string;
  keepPresentMonCsv?: boolean;
  presentMonRetentionMode?: "delete_after_parse" | "keep_until_session_end" | "keep_user_requested";
  presentMonGracePeriodMs?: number;
  presentMonRealtime?: boolean;
  presentMonRealtimeChunkMs?: number;
}

class PcSessionRuntime {
  private readonly adapter: WindowsProcessAdapter;
  private readonly diagnostics: PcDiagnosticsTimeline;
  private readonly watcher: WindowsProcessWatcher;
  private readonly processorCount: number;
  private sampler: WindowsProcessSampler;
  private session: Session;
  private status: Session["status"];
  private readonly presentMonRuntime: PresentMonCaptureRuntimeLike | undefined;
  private presentMonCaptureResult: PresentMonCaptureResult | undefined;
  private presentMonCaptureDrained = false;
  private presentMonCapturePending = false;
  private readonly presentMonMetricQueue: MetricEvent[] = [];
  private readonly presentMonRealtime: boolean;
  private readonly presentMonRealtimeChunkMs: number;

  constructor(options: PcRuntimeOptions) {
    this.session = { ...options.session };
    this.status = options.session.status;
    this.adapter = options.adapter;
    this.processorCount = options.processorCount;
    this.diagnostics = options.diagnostics;
    this.sampler = this.createSampler(options.process);
    this.presentMonRuntime = options.presentMonRuntime;
    this.presentMonRealtime = options.presentMonRealtime === true;
    this.presentMonRealtimeChunkMs = Math.max(1000, Math.round(options.presentMonRealtimeChunkMs ?? 1000));
    this.watcher = new WindowsProcessWatcher({
      adapter: options.adapter,
      pid: options.process.pid,
      processName: options.process.name,
      ...(options.process.startTimeMs === undefined ? {} : { processStartTimeMs: options.process.startTimeMs }),
      ...(options.process.executablePath === undefined ? {} : { executablePath: options.process.executablePath }),
      ...(options.allowProcessRebindByName === undefined ? {} : { allowProcessRebindByName: options.allowProcessRebindByName })
    });
    if (this.presentMonRuntime !== undefined) {
      const captureOptions: PresentMonSessionCaptureOptions = {
        sessionId: this.session.id,
        deviceId: this.session.deviceId,
        targetId: this.session.targetId,
        target: options.process,
        ...(options.presentMonCaptureDurationMs === undefined ? {} : { captureDurationMs: options.presentMonCaptureDurationMs }),
        ...(options.presentMonTargetMode === undefined ? {} : { targetMode: options.presentMonTargetMode }),
        ...(options.presentMonOutputDir === undefined ? {} : { outputDir: options.presentMonOutputDir }),
        ...(options.keepPresentMonCsv === undefined ? {} : { keepCsv: options.keepPresentMonCsv }),
        ...(options.presentMonRetentionMode === undefined ? {} : { retentionMode: options.presentMonRetentionMode }),
        ...(options.presentMonGracePeriodMs === undefined ? {} : { gracePeriodMs: options.presentMonGracePeriodMs })
      };
      if (this.presentMonRealtime) {
        void this.runPresentMonRealtimeLoop(captureOptions);
      } else {
        this.presentMonCapturePending = true;
        void this.presentMonRuntime
          .capture(captureOptions)
          .then((result) => {
            this.presentMonCaptureResult = result;
            this.presentMonCapturePending = false;
          })
          .catch((error: unknown) => {
            this.presentMonCapturePending = false;
            this.recordPresentMonRuntimeError(error, options.process.pid);
          });
      }
    }
  }

  getSession(): Session {
    return { ...this.session };
  }

  getStatus(): Session["status"] {
    return this.status;
  }

  getPresentMonCaptureStatus(): PresentMonCaptureStatusSnapshot {
    return (
      this.presentMonRuntime?.getStatus?.() ?? {
        status: "idle",
        updatedAt: Date.now(),
        warnings: [],
        diagnostics: []
      }
    );
  }

  pause(): void {
    if (this.status !== "running") {
      throw new CollectorError("PC session is not running.", "SESSION_NOT_RUNNING", {
        collectorId: "pc-local",
        sessionId: this.session.id
      });
    }
    this.status = "paused";
    this.session.status = "paused";
  }

  stop(): void {
    if (this.status === "stopped") {
      return;
    }
    this.status = "stopped";
    this.session.status = "stopped";
    this.session.endedAt = Date.now();
    if (this.presentMonCapturePending) {
      void this.presentMonRuntime?.abort();
    }
  }

  async *stream(): AsyncIterable<MetricEvent> {
    if (this.status === "stopped") {
      throw new CollectorError("PC session has already stopped.", "SESSION_NOT_RUNNING", {
        collectorId: "pc-local",
        sessionId: this.session.id
      });
    }
    for (;;) {
      if (this.isStopped()) {
        break;
      }
      if (this.status === "paused") {
        await sleep(this.session.sampleIntervalMs);
        continue;
      }
      for (const event of this.drainPresentMonEvents()) {
        yield event;
      }

      const state = await this.watcher.check();
      if (state.status === "exited" || state.status === "pid_reused") {
        this.diagnostics.add({
          level: "warn",
          category: "process",
          code: state.status === "pid_reused" ? "PID_REUSED" : "PROCESS_EXITED",
          message: state.reason ?? "PC target process is unavailable.",
          sessionId: this.session.id,
          deviceId: this.session.deviceId,
          targetId: this.session.targetId,
          pid: state.pid,
          details: {
            status: state.status
          }
        });
        this.status = "failed";
        this.session.status = "failed";
        throw new CollectorError(state.reason ?? "PC target process exited.", "PROCESS_EXITED", {
          collectorId: "pc-local",
          sessionId: this.session.id
        });
      }
      if (state.status === "rebound") {
        const rebound = await this.adapter.getProcess(state.pid);
        if (rebound !== null) {
          this.sampler = this.createSampler(rebound);
          this.diagnostics.add({
            level: "warn",
            category: "process",
            code: "PID_REUSED",
            message: "PC target process rebound by name/path. CPU baseline was reset.",
            sessionId: this.session.id,
            deviceId: this.session.deviceId,
            targetId: this.session.targetId,
            pid: state.pid,
            details: {
              previousPid: state.previousPid,
              newPid: state.pid
            }
          });
        }
      }

      const events = await this.sampler.sample();
      if (events.length === 0) {
        this.diagnostics.add({
          level: "debug",
          category: "cpu",
          code: "CPU_BASELINE_ONLY",
          message: "PC CPU sampler used this tick as baseline or skipped unavailable fields.",
          sessionId: this.session.id,
          deviceId: this.session.deviceId,
          targetId: this.session.targetId,
          pid: this.watcher.getCurrentPid()
        });
      }
      for (const event of events) {
        yield event;
      }
      for (const event of this.drainPresentMonEvents()) {
        yield event;
      }
      await sleep(this.session.sampleIntervalMs);
    }
    for (const event of this.drainPresentMonEvents()) {
      yield event;
    }
  }

  private createSampler(process: WindowsProcessInfo): WindowsProcessSampler {
    return new WindowsProcessSampler({
      adapter: this.adapter,
      sessionId: this.session.id,
      deviceId: this.session.deviceId,
      targetId: this.session.targetId,
      process,
      processorCount: this.processorCount
    });
  }

  private isStopped(): boolean {
    return this.status === "stopped";
  }

  private drainPresentMonEvents(): MetricEvent[] {
    const queued = this.presentMonMetricQueue.splice(0);
    if (this.presentMonCaptureResult === undefined || this.presentMonCaptureDrained) {
      return queued;
    }
    this.presentMonCaptureDrained = true;
    return [...queued, ...this.presentMonCaptureResult.metrics];
  }

  private async runPresentMonRealtimeLoop(options: PresentMonSessionCaptureOptions): Promise<void> {
    const runtime = this.presentMonRuntime;
    if (runtime === undefined) {
      return;
    }
    this.diagnostics.add({
      level: "info",
      category: "presentmon",
      code: "PRESENTMON_CAPTURE_PLANNED",
      message: "PresentMon realtime FPS capture loop was enabled.",
      sessionId: this.session.id,
      deviceId: this.session.deviceId,
      targetId: this.session.targetId,
      pid: options.target.pid,
      details: {
        chunkMs: this.presentMonRealtimeChunkMs
      }
    });

    while (!this.isStopped()) {
      if (this.status === "paused") {
        await sleep(this.session.sampleIntervalMs);
        continue;
      }
      this.presentMonCapturePending = true;
      try {
        const result = await runtime.capture({
          ...options,
          captureDurationMs: this.presentMonRealtimeChunkMs
        });
        this.presentMonCapturePending = false;
        if (result.metrics.length > 0) {
          this.presentMonMetricQueue.push(...result.metrics);
        }
        if (result.status === "aborted" || this.isStopped()) {
          break;
        }
        if (result.status === "failed") {
          break;
        }
      } catch (error) {
        this.presentMonCapturePending = false;
        this.recordPresentMonRuntimeError(error, options.target.pid);
        break;
      }
      await sleep(this.session.sampleIntervalMs);
    }
  }

  private recordPresentMonRuntimeError(error: unknown, pid: number): void {
    this.diagnostics.add({
      level: "error",
      category: "presentmon",
      code: "PRESENTMON_CAPTURE_FAILED",
      message: "PresentMon capture runtime failed.",
      sessionId: this.session.id,
      deviceId: this.session.deviceId,
      targetId: this.session.targetId,
      pid,
      details: {
        reason: error instanceof Error ? error.message : String(error)
      }
    });
  }
}

export class PcCollector implements MetricCollector {
  readonly id = "pc-local";
  readonly platform: Platform;

  private readonly adapter: WindowsProcessAdapter;
  private readonly commandRunner: CommandRunner;
  private readonly platformName: NodeJS.Platform;
  private readonly diagnostics: PcDiagnosticsTimeline;
  private readonly processorCount: number;
  private readonly presentMonTool: PresentMonTool;
  private readonly presentMonRuntimeFactory: PresentMonCaptureRuntimeFactory;
  private readonly presentMonTempDir: string | undefined;
  private readonly targetsByDeviceId = new Map<string, Target[]>();
  private readonly runtimes = new Map<string, PcSessionRuntime>();
  private readonly presentMonStatuses = new Map<string, PresentMonCaptureStatusSnapshot>();

  constructor(options: PcCollectorOptions = {}) {
    this.platformName = options.platform ?? process.platform;
    this.platform = platformFromNodePlatform(this.platformName);
    this.commandRunner = options.commandRunner ?? new CommandRunner();
    this.adapter = options.processAdapter ?? new WindowsProcessList({ commandRunner: this.commandRunner, platform: this.platformName });
    this.diagnostics = options.diagnostics ?? new PcDiagnosticsTimeline();
    this.processorCount = options.processorCount ?? (os.cpus().length || 1);
    this.presentMonTool = new PresentMonTool({
      commandRunner: this.commandRunner,
      platform: this.platformName,
      ...(options.presentMonPath === undefined ? {} : { presentMonPath: options.presentMonPath })
    });
    this.presentMonRuntimeFactory =
      options.presentMonRuntimeFactory ??
      ((factoryOptions) =>
        new PresentMonCaptureRuntime({
          commandRunner: factoryOptions.commandRunner,
          presentMonTool: factoryOptions.presentMonTool,
          diagnosticsTimeline: factoryOptions.diagnosticsTimeline,
          ...(factoryOptions.tempDir === undefined ? {} : { tempDir: factoryOptions.tempDir }),
          ...(factoryOptions.processLookup === undefined ? {} : { processLookup: factoryOptions.processLookup })
        }));
    this.presentMonTempDir = options.presentMonTempDir;
  }

  async getToolStatus(): Promise<ToolStatus> {
    return (await this.presentMonTool.findPresentMon()).toolStatus;
  }

  async getPresentMonStatus(): Promise<Record<string, unknown>> {
    const tool = await this.presentMonTool.findPresentMon();
    const compatibility =
      tool.presentMonPath === undefined
        ? null
        : await this.presentMonTool.getPresentMonCompatibility(tool.presentMonPath).catch((error: unknown) => ({
            supportsOutputFile: false,
            supportsTimedCapture: false,
            supportsProcessIdFilter: false,
            supportsProcessNameFilter: false,
            supportsTerminateAfterTimer: false,
            warnings: [error instanceof Error ? error.message : String(error)],
            recommendedArgsStyle: "long" as const,
            unsupportedReason: "PresentMon compatibility detection failed."
          }));
    return {
      toolStatus: tool.toolStatus,
      compatibility,
      limitations: [
        "PresentMon capture is explicit and experimental.",
        "No FPS is emitted when target matching fails or is ambiguous.",
        "LumaTrace does not bypass Windows permissions or include raw CSV in reports."
      ]
    };
  }

  listDiagnostics(options: PcDiagnosticsListOptions = {}): PcDiagnosticEvent[] {
    return this.diagnostics.list(options);
  }

  summarizeDiagnostics(sessionId?: string): PcDiagnosticsSummary {
    return this.diagnostics.summarize(sessionId);
  }

  async discoverDevices(): Promise<Device[]> {
    const device: Device = {
      id: `pc-local:${this.platform}`,
      platform: this.platform,
      name: "Local PC",
      connectionType: "local",
      osVersion: `${os.type()} ${os.release()}`,
      capabilities: await this.getCapabilities(),
      tags: {
        arch: os.arch(),
        nodePlatform: this.platformName,
        processorCount: this.processorCount,
        source: "node:os"
      }
    };
    return [device];
  }

  async listTargets(deviceId: string): Promise<Target[]> {
    if (deviceId !== `pc-local:${this.platform}`) {
      throw new CollectorError("PC device does not exist.", "DEVICE_NOT_FOUND", {
        collectorId: this.id,
        deviceId
      });
    }
    if (this.platform !== "windows") {
      this.diagnostics.add({
        level: "warn",
        category: "platform",
        code: "PC_PLATFORM_UNSUPPORTED",
        message: "Milestone 3A only supports Windows process targets.",
        deviceId
      });
      return [];
    }
    try {
      const targets = (await this.adapter.listProcesses()).slice(0, 500).map((process) => processToTarget(process));
      this.targetsByDeviceId.set(deviceId, targets);
      return targets;
    } catch (error) {
      this.diagnostics.add({
        level: "error",
        category: "process",
        code: "PROCESS_LIST_FAILED",
        message: "Windows process list failed.",
        deviceId,
        details: {
          reason: error instanceof Error ? error.message : String(error)
        }
      });
      return [];
    }
  }

  async getCapabilities(): Promise<MetricAvailability[]> {
    const presentMon = await this.presentMonTool.findPresentMon();
    const pcPlatform = this.platform === "macos" ? "macos" : this.platform === "linux" ? "linux" : "windows";
    return getPcCapabilities({
      platform: pcPlatform,
      presentMonAvailable: presentMon.toolStatus.status === "available"
    });
  }

  async startSession(config: SessionConfig): Promise<Session> {
    if (this.platform !== "windows") {
      throw new CollectorError("PC process sampling is only available on Windows in Milestone 3A.", "PC_PLATFORM_UNSUPPORTED", {
        collectorId: this.id,
        deviceId: config.deviceId
      });
    }
    const sessionId = config.id ?? `pc-session-${Date.now()}`;
    const pid = targetPidFromId(config.targetId);
    if (pid === null) {
      throw new CollectorError("PC target does not include a PID.", "TARGET_NOT_FOUND", {
        collectorId: this.id,
        targetId: config.targetId,
        sessionId
      });
    }
    const process = await this.adapter.getProcess(pid);
    if (process === null) {
      this.diagnostics.add({
        level: "error",
        category: "process",
        code: "PROCESS_NOT_FOUND",
        message: "PC target process was not found.",
        sessionId,
        deviceId: config.deviceId,
        targetId: config.targetId,
        pid
      });
      throw new CollectorError("PC target process was not found.", "PROCESS_NOT_FOUND", {
        collectorId: this.id,
        targetId: config.targetId,
        sessionId
      });
    }
    const enablePresentMonCapture = config.options?.enablePresentMonCapture === true;
    const enablePresentMonRealtime = config.options?.enablePresentMonRealtime === true;
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
        platform: "windows",
        pid,
        processName: process.name,
        runtimeId: processRuntimeId(process),
        fpsAvailable: enablePresentMonCapture || enablePresentMonRealtime,
        enablePresentMonCapture,
        enablePresentMonRealtime,
        presentMonCaptureDurationMs:
          typeof config.options?.presentMonCaptureDurationMs === "number" ? config.options.presentMonCaptureDurationMs : 10000,
        presentMonRealtimeChunkMs:
          typeof config.options?.presentMonRealtimeChunkMs === "number" ? config.options.presentMonRealtimeChunkMs : 1000,
        presentMonTargetMode:
          config.options?.presentMonTargetMode === "process_name" ? "process_name" : "pid",
        keepPresentMonCsv: config.options?.keepPresentMonCsv === true,
        presentMonRetentionMode:
          config.options?.presentMonRetentionMode === "keep_until_session_end" ||
          config.options?.presentMonRetentionMode === "keep_user_requested"
            ? config.options.presentMonRetentionMode
            : "delete_after_parse"
      }
    };
    const presentMonRuntime = enablePresentMonCapture || enablePresentMonRealtime
      ? this.presentMonRuntimeFactory({
          commandRunner: this.commandRunner,
          presentMonTool: this.presentMonTool,
          diagnosticsTimeline: this.diagnostics,
          ...(this.presentMonTempDir === undefined ? {} : { tempDir: this.presentMonTempDir }),
          processLookup: (processId) => this.adapter.getProcess(processId)
        })
      : undefined;
    this.runtimes.set(
      session.id,
      new PcSessionRuntime({
        session,
        adapter: this.adapter,
        process,
        processorCount: this.processorCount,
        diagnostics: this.diagnostics,
        allowProcessRebindByName: config.options?.allowProcessRebindByName === true,
        ...(presentMonRuntime === undefined ? {} : { presentMonRuntime }),
        ...(typeof config.options?.presentMonCaptureDurationMs === "number"
          ? { presentMonCaptureDurationMs: config.options.presentMonCaptureDurationMs }
          : {}),
        ...(config.options?.presentMonTargetMode === "process_name" ? { presentMonTargetMode: "process_name" } : { presentMonTargetMode: "pid" }),
        ...(typeof config.options?.presentMonOutputDir === "string" ? { presentMonOutputDir: config.options.presentMonOutputDir } : {}),
        keepPresentMonCsv: config.options?.keepPresentMonCsv === true,
        presentMonRetentionMode:
          config.options?.presentMonRetentionMode === "keep_until_session_end" ||
          config.options?.presentMonRetentionMode === "keep_user_requested"
            ? config.options.presentMonRetentionMode
            : "delete_after_parse",
        ...(typeof config.options?.presentMonGracePeriodMs === "number"
          ? { presentMonGracePeriodMs: config.options.presentMonGracePeriodMs }
          : {}),
        presentMonRealtime: enablePresentMonRealtime,
        ...(typeof config.options?.presentMonRealtimeChunkMs === "number"
          ? { presentMonRealtimeChunkMs: config.options.presentMonRealtimeChunkMs }
          : {})
      })
    );
    this.presentMonStatuses.set(session.id, this.getPresentMonCaptureStatus(session.id));
    return { ...session };
  }

  async pauseSession(sessionId: string): Promise<void> {
    this.getRuntime(sessionId).pause();
  }

  async stopSession(sessionId: string): Promise<void> {
    const runtime = this.getRuntime(sessionId);
    runtime.stop();
    this.presentMonStatuses.set(sessionId, runtime.getPresentMonCaptureStatus());
    this.runtimes.delete(sessionId);
  }

  streamMetrics(sessionId: string): AsyncIterable<MetricEvent> {
    return this.getRuntime(sessionId).stream();
  }

  getPresentMonCaptureStatus(sessionId: string): PresentMonCaptureStatusSnapshot {
    return (
      this.runtimes.get(sessionId)?.getPresentMonCaptureStatus() ?? {
        ...(this.presentMonStatuses.get(sessionId) ?? {
          status: "idle",
          updatedAt: Date.now(),
          warnings: [],
          diagnostics: []
        })
      }
    );
  }

  private getRuntime(sessionId: string): PcSessionRuntime {
    const runtime = this.runtimes.get(sessionId);
    if (runtime === undefined) {
      throw new CollectorError("PC session does not exist.", "SESSION_NOT_FOUND", {
        collectorId: this.id,
        sessionId
      });
    }
    return runtime;
  }
}
