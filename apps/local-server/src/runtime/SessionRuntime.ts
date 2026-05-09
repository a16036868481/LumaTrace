import type { MetricEvent, MetricCollector, Session } from "@lumatrace/core";
import type { MetricRepository, SessionRepository } from "@lumatrace/storage";
import type { MetricRingBuffer } from "./MetricRingBuffer";
import { AppError } from "../utils/errors";

export interface SessionStreamMessage {
  type: "metric" | "session_status" | "error" | "session_stopped";
  data?: unknown;
  error?: {
    code: string;
    message: string;
  };
}

export interface SessionRuntimeClient {
  send(message: SessionStreamMessage): void;
  close?(): void;
}

export interface DiagnosticSink {
  create(input: {
    level: "debug" | "info" | "warn" | "error";
    category: string;
    message: string;
    details?: Record<string, unknown>;
    sessionId?: string;
    deviceId?: string;
  }): void;
}

export interface SessionRuntimeOptions {
  session: Session;
  collector: MetricCollector;
  metricRepository: MetricRepository;
  sessionRepository: SessionRepository;
  diagnosticService: DiagnosticSink;
  ringBuffer: MetricRingBuffer;
  batchSize?: number;
  flushIntervalMs?: number;
}

interface CollectorWithFinalMetrics {
  drainFinalMetrics(sessionId: string): Promise<MetricEvent[]> | MetricEvent[];
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class SessionRuntime {
  private session: Session;
  private readonly collector: MetricCollector;
  private readonly metricRepository: MetricRepository;
  private readonly sessionRepository: SessionRepository;
  private readonly diagnosticService: DiagnosticSink;
  private readonly ringBuffer: MetricRingBuffer;
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private readonly clients = new Set<SessionRuntimeClient>();
  private readonly pendingMetrics: MetricEvent[] = [];
  private started = false;
  private stopping = false;
  private loopPromise: Promise<void> | undefined;
  private lastFlushAt = Date.now();

  constructor(options: SessionRuntimeOptions) {
    this.session = cloneSession(options.session);
    this.collector = options.collector;
    this.metricRepository = options.metricRepository;
    this.sessionRepository = options.sessionRepository;
    this.diagnosticService = options.diagnosticService;
    this.ringBuffer = options.ringBuffer;
    this.batchSize = options.batchSize ?? 50;
    this.flushIntervalMs = options.flushIntervalMs ?? 1000;
  }

  get id(): string {
    return this.session.id;
  }

  getStatus(): Session["status"] {
    return this.session.status;
  }

  getSession(): Session {
    return cloneSession(this.session);
  }

  async start(): Promise<Session> {
    if (this.started) {
      throw new AppError("SESSION_ALREADY_RUNNING", "Session runtime is already started.", 409, {
        sessionId: this.session.id
      });
    }

    this.started = true;
    const sessionConfig = {
      id: this.session.id,
      name: this.session.name,
      deviceId: this.session.deviceId,
      targetId: this.session.targetId,
      sampleIntervalMs: this.session.sampleIntervalMs
    };
    if (this.session.config !== undefined) {
      Object.assign(sessionConfig, { options: this.session.config });
    }
    const collectorSession = await this.collector.startSession(sessionConfig);
    const nextSession: Session = {
      ...this.session,
      ...collectorSession,
      id: this.session.id,
      status: "running"
    };
    if (this.session.config !== undefined) {
      nextSession.config = this.session.config;
    }
    this.session = nextSession;
    this.sessionRepository.upsert(this.session);
    this.broadcast({
      type: "session_status",
      data: {
        sessionId: this.session.id,
        status: this.session.status
      }
    });
    this.loopPromise = this.collectLoop();
    return this.getSession();
  }

  async pause(): Promise<void> {
    if (this.session.status !== "running") {
      throw new AppError("SESSION_NOT_RUNNING", "Session is not running.", 409, {
        sessionId: this.session.id
      });
    }

    await this.collector.pauseSession(this.session.id);
    this.session.status = "paused";
    this.sessionRepository.updateStatus(this.session.id, "paused");
    this.broadcast({
      type: "session_status",
      data: {
        sessionId: this.session.id,
        status: this.session.status
      }
    });
  }

  async stop(): Promise<void> {
    if (this.session.status === "stopped") {
      await this.flush();
      return;
    }

    this.stopping = true;
    const endedAt = Date.now();
    try {
      await this.collector.stopSession(this.session.id);
    } catch (error) {
      this.writeDiagnostic("warn", "runtime", "Collector stop failed.", {
        error: errorMessage(error)
      });
    }
    await this.collectFinalMetrics();

    this.session.status = "stopped";
    this.session.endedAt = endedAt;
    this.sessionRepository.updateStatus(this.session.id, "stopped", { endedAt });

    if (this.loopPromise !== undefined) {
      await this.loopPromise;
    }

    await this.flush();
    this.broadcast({
      type: "session_stopped",
      data: {
        sessionId: this.session.id
      }
    });
    for (const client of this.clients) {
      client.close?.();
    }
    this.clients.clear();
  }

  subscribe(client: SessionRuntimeClient): () => void {
    this.clients.add(client);
    return () => {
      this.clients.delete(client);
    };
  }

  async flush(): Promise<void> {
    if (this.pendingMetrics.length === 0) {
      return;
    }

    const batch = this.pendingMetrics.splice(0);
    try {
      this.metricRepository.insertRawBatch(batch);
      this.lastFlushAt = Date.now();
    } catch (error) {
      this.writeDiagnostic("error", "storage", "Failed to persist metric batch.", {
        error: errorMessage(error),
        metricCount: batch.length
      });
    }
  }

  private async collectLoop(): Promise<void> {
    try {
      for await (const event of this.collector.streamMetrics(this.session.id)) {
        if (this.stopping) {
          break;
        }

        try {
          this.handleMetric(event);
          if (
            this.pendingMetrics.length >= this.batchSize ||
            Date.now() - this.lastFlushAt >= this.flushIntervalMs
          ) {
            await this.flush();
          }
        } catch (error) {
          this.writeDiagnostic("error", "runtime", "Failed to process metric event.", {
            error: errorMessage(error)
          });
        }
      }
    } catch (error) {
      this.session.status = "failed";
      this.sessionRepository.updateStatus(this.session.id, "failed");
      this.writeDiagnostic("error", "collector", "Metric collection loop failed.", {
        error: errorMessage(error)
      });
      this.broadcast({
        type: "error",
        error: {
          code: "INTERNAL_ERROR",
          message: "Metric collection loop failed."
        }
      });
    } finally {
      await this.flush();
    }
  }

  private handleMetric(event: MetricEvent): void {
    this.ringBuffer.push(event);
    this.pendingMetrics.push(event);
    this.broadcast({
      type: "metric",
      data: event
    });
  }

  private async collectFinalMetrics(): Promise<void> {
    const maybeCollector = this.collector as MetricCollector & Partial<CollectorWithFinalMetrics>;
    if (typeof maybeCollector.drainFinalMetrics !== "function") {
      return;
    }

    try {
      const events = await maybeCollector.drainFinalMetrics(this.session.id);
      for (const event of events) {
        this.handleMetric(event);
      }
      if (events.length > 0) {
        await this.flush();
      }
    } catch (error) {
      this.writeDiagnostic("warn", "runtime", "Failed to collect final metric events.", {
        error: errorMessage(error)
      });
    }
  }

  private broadcast(message: SessionStreamMessage): void {
    for (const client of [...this.clients]) {
      try {
        client.send(message);
      } catch (error) {
        this.clients.delete(client);
        this.writeDiagnostic("warn", "websocket", "Failed to send websocket message.", {
          error: errorMessage(error)
        });
      }
    }
  }

  private writeDiagnostic(
    level: "debug" | "info" | "warn" | "error",
    category: string,
    message: string,
    details?: Record<string, unknown>
  ): void {
    try {
      const input: Parameters<DiagnosticSink["create"]>[0] = {
        level,
        category,
        message,
        sessionId: this.session.id,
        deviceId: this.session.deviceId
      };
      if (details !== undefined) {
        input.details = details;
      }
      this.diagnosticService.create(input);
    } catch {
      // Diagnostics must never bring down the runtime.
    }
  }
}
