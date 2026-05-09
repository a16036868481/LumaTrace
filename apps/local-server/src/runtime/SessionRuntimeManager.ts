import type { Session } from "@lumatrace/core";
import type { MetricRepository, SessionRepository } from "@lumatrace/storage";
import type { CollectorRegistry } from "./CollectorRegistry";
import type { MetricRingBuffer } from "./MetricRingBuffer";
import { SessionRuntime, type DiagnosticSink, type SessionRuntimeClient } from "./SessionRuntime";
import { AppError } from "../utils/errors";

export interface SessionRuntimeManagerOptions {
  collectorRegistry: CollectorRegistry;
  metricRepository: MetricRepository;
  sessionRepository: SessionRepository;
  diagnosticService: DiagnosticSink;
  ringBuffer: MetricRingBuffer;
  metricBatchSize?: number;
  metricFlushIntervalMs?: number;
}

export class SessionRuntimeManager {
  private readonly collectorRegistry: CollectorRegistry;
  private readonly metricRepository: MetricRepository;
  private readonly sessionRepository: SessionRepository;
  private readonly diagnosticService: DiagnosticSink;
  private readonly ringBuffer: MetricRingBuffer;
  private readonly metricBatchSize: number | undefined;
  private readonly metricFlushIntervalMs: number | undefined;
  private readonly runtimes = new Map<string, SessionRuntime>();

  constructor(options: SessionRuntimeManagerOptions) {
    this.collectorRegistry = options.collectorRegistry;
    this.metricRepository = options.metricRepository;
    this.sessionRepository = options.sessionRepository;
    this.diagnosticService = options.diagnosticService;
    this.ringBuffer = options.ringBuffer;
    this.metricBatchSize = options.metricBatchSize;
    this.metricFlushIntervalMs = options.metricFlushIntervalMs;
  }

  async startSession(session: Session): Promise<SessionRuntime> {
    const existing = this.runtimes.get(session.id);
    if (existing !== undefined && existing.getStatus() === "running") {
      throw new AppError("SESSION_ALREADY_RUNNING", "Session is already running.", 409, {
        sessionId: session.id
      });
    }

    const collector = await this.collectorRegistry.getByDeviceId(session.deviceId);
    if (collector === undefined) {
      throw new AppError("DEVICE_NOT_FOUND", `Device not found: ${session.deviceId}`, 404, {
        deviceId: session.deviceId
      });
    }

    const runtimeOptions = {
      session,
      collector,
      metricRepository: this.metricRepository,
      sessionRepository: this.sessionRepository,
      diagnosticService: this.diagnosticService,
      ringBuffer: this.ringBuffer
    };
    const runtime = new SessionRuntime({
      ...runtimeOptions,
      ...(this.metricBatchSize === undefined ? {} : { batchSize: this.metricBatchSize }),
      ...(this.metricFlushIntervalMs === undefined
        ? {}
        : { flushIntervalMs: this.metricFlushIntervalMs })
    });
    this.runtimes.set(session.id, runtime);
    await runtime.start();
    return runtime;
  }

  getRuntime(sessionId: string): SessionRuntime | undefined {
    return this.runtimes.get(sessionId);
  }

  getRingBuffer(): MetricRingBuffer {
    return this.ringBuffer;
  }

  async stopSession(sessionId: string): Promise<void> {
    const runtime = this.runtimes.get(sessionId);
    if (runtime === undefined) {
      return;
    }

    await runtime.stop();
    this.runtimes.delete(sessionId);
  }

  async stopAll(): Promise<void> {
    const runtimes = [...this.runtimes.values()];
    await Promise.all(runtimes.map((runtime) => runtime.stop()));
    this.runtimes.clear();
  }

  subscribe(sessionId: string, client: SessionRuntimeClient): () => void {
    const runtime = this.runtimes.get(sessionId);
    if (runtime === undefined) {
      return () => undefined;
    }

    return runtime.subscribe(client);
  }

  size(): number {
    return this.runtimes.size;
  }
}
