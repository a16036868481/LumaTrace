import { CollectorError, type MetricEvent, type Session } from "@lumatrace/core";
import type { AndroidAdbClientLike } from "../types";
import type { AndroidFpsProbeLike, AndroidFpsProbeResult } from "../fps/AndroidFpsProbe";
import type { AndroidAppLifecycle } from "../lifecycle/AndroidAppLifecycle";
import { AndroidProcessWatcher } from "../lifecycle/AndroidProcessWatcher";
import type { AndroidProcessMissingPolicy } from "../lifecycle/AndroidLifecycleTypes";
import type { AndroidDiagnosticCollector } from "../diagnostics/AndroidDiagnosticCollector";
import { AndroidMetricSampler } from "./AndroidMetricSampler";
import type { AndroidSamplerContext } from "./AndroidSamplerTypes";

export interface AndroidSessionRuntimeOptions {
  session: Session;
  adbClient: AndroidAdbClientLike;
  serial: string;
  packageName: string;
  pid: number;
  uid?: number;
  processName?: string;
  fpsProbe?: AndroidFpsProbeLike;
  fpsProbePrepareResult?: AndroidFpsProbeResult;
  realtimeFps?: boolean;
  fpsSampleIntervalMs?: number;
  appLifecycle?: AndroidAppLifecycle;
  stopTargetOnSessionStop?: boolean;
  processMissingPolicy?: AndroidProcessMissingPolicy;
  processMissingToleranceMs?: number;
  processRebindTimeoutMs?: number;
  diagnostics?: AndroidDiagnosticCollector;
}

interface AbortableAdbClient {
  abortPendingCommands(): void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function cloneSession(session: Session): Session {
  const cloned: Session = { ...session };
  if (session.notes !== undefined) {
    cloned.notes = [...session.notes];
  }
  if (session.config !== undefined) {
    cloned.config = { ...session.config };
  }
  return cloned;
}

export class AndroidSessionRuntime {
  private readonly context: AndroidSamplerContext;
  private sampler: AndroidMetricSampler;
  private readonly processWatcher: AndroidProcessWatcher;
  private readonly fpsProbe: AndroidFpsProbeLike | undefined;
  private readonly adbClient: AndroidAdbClientLike;
  private readonly appLifecycle: AndroidAppLifecycle | undefined;
  private readonly stopTargetOnSessionStop: boolean;
  private readonly processMissingPolicy: AndroidProcessMissingPolicy;
  private readonly diagnostics: AndroidDiagnosticCollector | undefined;
  private fpsProbePrepareResult: AndroidFpsProbeResult | undefined;
  private fpsProbeFinishResult: AndroidFpsProbeResult | undefined;
  private readonly realtimeFps: boolean;
  private readonly fpsSampleIntervalMs: number;
  private lastFpsSampleAt = 0;
  private stopTargetResult: unknown;
  private session: Session;
  private status: Session["status"];
  private sequence = 0;
  private processMissingDiagnosticRecorded = false;
  private readonly startedMonotonicMs = Date.now();

  constructor(options: AndroidSessionRuntimeOptions) {
    this.session = cloneSession(options.session);
    this.status = options.session.status;
    this.adbClient = options.adbClient;
    this.fpsProbe = options.fpsProbe;
    this.appLifecycle = options.appLifecycle;
    this.stopTargetOnSessionStop = options.stopTargetOnSessionStop === true;
    this.processMissingPolicy = options.processMissingPolicy ?? "pause_process_metrics_keep_device_metrics";
    this.diagnostics = options.diagnostics;
    this.fpsProbePrepareResult = options.fpsProbePrepareResult;
    this.realtimeFps = options.realtimeFps === true;
    this.fpsSampleIntervalMs = Math.max(1000, Math.round(options.fpsSampleIntervalMs ?? 1000));

    this.context = {
      sessionId: options.session.id,
      deviceId: options.session.deviceId,
      targetId: options.session.targetId,
      serial: options.serial,
      pid: options.pid,
      packageName: options.packageName,
      sampleIntervalMs: options.session.sampleIntervalMs,
      nowMs: () => Date.now(),
      monotonicMs: () => Date.now() - this.startedMonotonicMs,
      nextSequence: () => ++this.sequence,
      ...(options.processName === undefined ? {} : { processName: options.processName })
    };
    this.sampler = new AndroidMetricSampler({
      adbClient: options.adbClient,
      context: this.context,
      ...(options.uid === undefined ? {} : { uid: options.uid })
    });
    this.processWatcher = new AndroidProcessWatcher({
      adbClient: options.adbClient,
      serial: options.serial,
      packageName: options.packageName,
      initialPid: options.pid,
      ...(options.processMissingToleranceMs === undefined
        ? {}
        : { missingToleranceMs: options.processMissingToleranceMs }),
      ...(options.processRebindTimeoutMs === undefined
        ? {}
        : { rebindTimeoutMs: options.processRebindTimeoutMs })
    });
  }

  getSession(): Session {
    return cloneSession(this.session);
  }

  getStatus(): Session["status"] {
    return this.status;
  }

  pause(): void {
    if (this.status !== "running") {
      throw new CollectorError("Android session is not running.", "SESSION_NOT_RUNNING", {
        collectorId: "android-adb",
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
    const abortable = this.contextualAdbClient();
    abortable?.abortPendingCommands();
    this.status = "stopped";
    this.session.status = "stopped";
    this.session.endedAt = Date.now();
  }

  async stopTargetIfRequested(): Promise<unknown> {
    if (!this.stopTargetOnSessionStop || this.appLifecycle === undefined) {
      return undefined;
    }
    if (this.stopTargetResult !== undefined) {
      return this.stopTargetResult;
    }
    this.stopTargetResult = await this.appLifecycle.stopApp({ waitUntilStopped: true });
    this.diagnostics?.add({
      level: "info",
      category: "lifecycle",
      code: "APP_FORCE_STOPPED",
      message: "Android target was force-stopped after session stop because stopTargetOnSessionStop was enabled.",
      sessionId: this.session.id,
      deviceId: this.session.deviceId,
      targetId: this.session.targetId,
      packageName: this.context.packageName,
      details: {
        result: this.stopTargetResult
      }
    });
    this.session.config = {
      ...(this.session.config ?? {}),
      stopTargetOnSessionStop: true,
      stopTargetResult: this.stopTargetResult
    };
    return this.stopTargetResult;
  }

  async finishExperimentalFpsProbe(): Promise<AndroidFpsProbeResult | undefined> {
    if (this.fpsProbe === undefined) {
      return undefined;
    }
    if (this.fpsProbeFinishResult !== undefined) {
      return this.fpsProbeFinishResult;
    }
    try {
      this.fpsProbeFinishResult = await this.fpsProbe.finish();
      this.recordFpsProbeDiagnostics(this.fpsProbeFinishResult);
      this.session.config = {
        ...(this.session.config ?? {}),
        experimentalFpsProbe: {
          prepareStatus: this.fpsProbePrepareResult?.status,
          finishStatus: this.fpsProbeFinishResult.status,
          warningCount:
            (this.fpsProbePrepareResult?.warnings.length ?? 0) + this.fpsProbeFinishResult.warnings.length
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.diagnostics?.add({
        level: "warn",
        category: "fps",
        code: "FPS_PROBE_FAILED",
        message: "Android experimental FPS probe failed during session stop.",
        sessionId: this.session.id,
        deviceId: this.session.deviceId,
        targetId: this.session.targetId,
        packageName: this.context.packageName,
        details: {
          reason: message
        }
      });
      this.session.config = {
        ...(this.session.config ?? {}),
        experimentalFpsProbe: {
          prepareStatus: this.fpsProbePrepareResult?.status,
          finishStatus: "failed",
          warningCount: 1,
          reason: message
        }
      };
    }
    return this.fpsProbeFinishResult;
  }

  async *stream(): AsyncIterable<MetricEvent> {
    const initialStatus = this.status;
    if (initialStatus === "stopped") {
      throw new CollectorError("Android session has already stopped.", "SESSION_NOT_RUNNING", {
        collectorId: "android-adb",
        sessionId: this.session.id
      });
    }

    for (;;) {
      if (this.status === "stopped") {
        break;
      }
      if (this.status === "paused") {
        await sleep(this.session.sampleIntervalMs);
        continue;
      }

      const processState = await this.processWatcher.check();
      if (processState.status === "stopped" || (processState.status === "missing" && this.processMissingPolicy === "fail_session")) {
        const targetEnded = processState.status === "stopped";
        this.diagnostics?.add({
          level: targetEnded ? "warn" : "error",
          category: "process",
          code: targetEnded ? "TARGET_PROCESS_ENDED" : "PID_MISSING",
          message: processState.reason ?? "Target process is no longer running.",
          sessionId: this.session.id,
          deviceId: this.session.deviceId,
          targetId: this.session.targetId,
          packageName: this.context.packageName,
          ...(processState.previousPid === undefined ? {} : { pid: processState.previousPid })
        });
        this.status = targetEnded ? "stopped" : "failed";
        this.session.status = this.status;
        this.session.endedAt = Date.now();
        throw new CollectorError(
          processState.reason ?? "Target process is no longer running.",
          targetEnded ? "TARGET_PROCESS_ENDED" : "TARGET_PROCESS_NOT_RUNNING",
          {
            collectorId: "android-adb",
            sessionId: this.session.id
          }
        );
      }

      if (processState.status === "missing") {
        if (!this.processMissingDiagnosticRecorded) {
          this.processMissingDiagnosticRecorded = true;
          this.diagnostics?.add({
            level: "warn",
            category: "process",
            code: "PID_MISSING",
            message: processState.reason ?? "Target process is missing.",
            sessionId: this.session.id,
            deviceId: this.session.deviceId,
            targetId: this.session.targetId,
            packageName: this.context.packageName,
            ...(processState.previousPid === undefined ? {} : { pid: processState.previousPid })
          });
        }
        if (this.processMissingPolicy === "wait_for_rebind") {
          await sleep(this.session.sampleIntervalMs);
          continue;
        }
        for (const event of await this.collectSample({ processMissing: true })) {
          yield event;
        }
        await sleep(this.session.sampleIntervalMs);
        continue;
      }

      if (processState.status === "rebound" && processState.pid !== undefined) {
        this.processMissingDiagnosticRecorded = false;
        this.sampler.rebindProcess(processState.pid);
        this.diagnostics?.add({
          level: "info",
          category: "process",
          code: "PID_REBOUND",
          message: "Android target process rebound to a new PID. CPU sampler baseline was reset.",
          sessionId: this.session.id,
          deviceId: this.session.deviceId,
          targetId: this.session.targetId,
          packageName: this.context.packageName,
          pid: processState.pid,
          details: {
            previousPid: processState.previousPid,
            newPid: processState.pid
          }
        });
        this.session.config = {
          ...(this.session.config ?? {}),
          currentPid: processState.pid,
          lastPidRebound: {
            previousPid: processState.previousPid,
            pid: processState.pid,
            timestampMs: processState.timestampMs
          }
        };
      }

      if (processState.status === "running") {
        this.processMissingDiagnosticRecorded = false;
      }

      for (const event of await this.collectSample()) {
        yield event;
      }
      for (const event of await this.collectRealtimeFpsSample()) {
        yield event;
      }
      await sleep(this.session.sampleIntervalMs);
    }
  }

  private contextualAdbClient(): AbortableAdbClient | undefined {
    const maybeAbortable = this.adbClient;
    if (
      typeof maybeAbortable === "object" &&
      maybeAbortable !== null &&
      "abortPendingCommands" in maybeAbortable &&
      typeof (maybeAbortable as AbortableAdbClient).abortPendingCommands === "function"
    ) {
      return maybeAbortable as AbortableAdbClient;
    }
    return undefined;
  }

  private async collectSample(options: { processMissing?: boolean } = {}): Promise<MetricEvent[]> {
    const events = await this.sampler.sample(options);
    this.recordSamplerErrors();
    this.recordMetricDiagnostics(events);
    return events;
  }

  private async collectRealtimeFpsSample(): Promise<MetricEvent[]> {
    if (!this.realtimeFps || this.fpsProbe === undefined) {
      return [];
    }
    const now = Date.now();
    if (now - this.lastFpsSampleAt < this.fpsSampleIntervalMs) {
      return [];
    }
    this.lastFpsSampleAt = now;
    try {
      const result = await this.fpsProbe.finish();
      this.recordFpsProbeDiagnostics(result);
      const events = result.metricEvents ?? [];
      try {
        this.fpsProbePrepareResult = await this.fpsProbe.prepare();
      } catch (error) {
        this.diagnostics?.add({
          level: "warn",
          category: "fps",
          code: "FPS_PROBE_FAILED",
          message: "Android realtime FPS probe could not reset its next sampling window.",
          sessionId: this.session.id,
          deviceId: this.session.deviceId,
          targetId: this.session.targetId,
          packageName: this.context.packageName,
          details: {
            reason: error instanceof Error ? error.message : String(error)
          }
        });
      }
      return events;
    } catch (error) {
      this.diagnostics?.add({
        level: "warn",
        category: "fps",
        code: "FPS_PROBE_FAILED",
        message: "Android realtime FPS probe failed.",
        sessionId: this.session.id,
        deviceId: this.session.deviceId,
        targetId: this.session.targetId,
        packageName: this.context.packageName,
        details: {
          reason: error instanceof Error ? error.message : String(error)
        }
      });
      return [];
    }
  }

  private recordSamplerErrors(): void {
    for (const error of this.sampler.consumeErrors()) {
      const sampler = error.sampler.toLowerCase();
      const code = sampler.includes("cpu")
        ? "CPU_SAMPLE_FAILED"
        : sampler.includes("memory")
          ? "MEMINFO_PARSE_WARNING"
          : sampler.includes("network")
            ? "NETSTATS_UID_MISSING"
            : sampler.includes("battery")
              ? "BATTERY_FIELD_MISSING"
              : "CPU_SAMPLE_FAILED";
      this.diagnostics?.add({
        level: "warn",
        category: sampler.includes("network")
          ? "network"
          : sampler.includes("memory")
            ? "memory"
            : sampler.includes("battery")
              ? "battery"
              : "cpu",
        code,
        message: error.message,
        sessionId: this.session.id,
        deviceId: this.session.deviceId,
        targetId: this.session.targetId,
        packageName: this.context.packageName,
        pid: this.context.pid,
        details: {
          sampler: error.sampler
        }
      });
    }
  }

  private recordMetricDiagnostics(events: readonly MetricEvent[]): void {
    for (const event of events) {
      if (event.metricName === "memory_mb" && event.tags?.fallback === true) {
        this.diagnostics?.add({
          level: "warn",
          category: "memory",
          code: "MEMINFO_FALLBACK_PROC_STATUS",
          message: "Android memory fell back to /proc/<pid>/status with lower confidence.",
          sessionId: this.session.id,
          deviceId: this.session.deviceId,
          targetId: this.session.targetId,
          packageName: this.context.packageName,
          pid: this.context.pid,
          details: {
            source: event.source,
            precision: event.precision,
            confidence: event.confidence,
            fallbackReason: event.tags.fallbackReason
          }
        });
      }
      if (event.metricName.startsWith("network_") && event.precision === "device_level") {
        this.diagnostics?.add({
          level: "warn",
          category: "network",
          code: "NETWORK_FALLBACK_DEVICE_LEVEL",
          message: "Android network fell back to device-level counters.",
          sessionId: this.session.id,
          deviceId: this.session.deviceId,
          targetId: this.session.targetId,
          packageName: this.context.packageName,
          details: {
            scope: event.tags?.scope,
            fallbackReason: event.tags?.fallbackReason,
            source: event.source,
            precision: event.precision
          }
        });
      }
    }
  }

  private recordFpsProbeDiagnostics(result: AndroidFpsProbeResult): void {
    const code =
      result.status === "available"
        ? "FPS_PROBE_RESULT"
        : result.status === "ambiguous"
        ? "FPS_LAYER_MATCH_AMBIGUOUS"
        : result.status === "unavailable"
          ? "FPS_LAYER_MATCH_NONE"
          : result.status === "failed"
            ? "FPS_PROBE_FAILED"
            : "FPS_PROBE_DISABLED";
    this.diagnostics?.add({
      level: result.status === "available" ? "info" : "warn",
      category: "fps",
      code,
      message:
        result.status === "available"
          ? "Android experimental FPS probe produced a result."
          : "Android experimental FPS probe did not produce target FPS.",
      sessionId: this.session.id,
      deviceId: this.session.deviceId,
      targetId: this.session.targetId,
      packageName: this.context.packageName,
      details: {
        status: result.status,
        sourceUsed: result.sourceUsed,
        matchedLayerName: result.matchedLayerName,
        layerMatchConfidence: result.layerMatchConfidence,
        warnings: result.warnings
      }
    });
  }
}
