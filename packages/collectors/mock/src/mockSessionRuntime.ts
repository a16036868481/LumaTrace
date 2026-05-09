import { CollectorError, type MetricEvent, type Session } from "@lumatrace/core";
import { createMockMetricGenerator } from "./mockMetricGenerator";
import type { MockMetricProfile } from "./mockProfiles";

export interface MockSessionRuntimeOptions {
  session: Session;
  profile: MockMetricProfile;
  seed: string | number;
  immediate: boolean;
}

function cloneSession(session: Session): Session {
  const cloned: Session = {
    id: session.id,
    name: session.name,
    deviceId: session.deviceId,
    targetId: session.targetId,
    sampleIntervalMs: session.sampleIntervalMs,
    status: session.status
  };

  if (session.startedAt !== undefined) {
    cloned.startedAt = session.startedAt;
  }
  if (session.endedAt !== undefined) {
    cloned.endedAt = session.endedAt;
  }
  if (session.notes !== undefined) {
    cloned.notes = [...session.notes];
  }
  if (session.config !== undefined) {
    cloned.config = { ...session.config };
  }

  return cloned;
}

export class MockSessionRuntime {
  private readonly session: Session;
  private readonly profile: MockMetricProfile;
  private readonly seed: string | number;
  private readonly immediate: boolean;

  constructor(options: MockSessionRuntimeOptions) {
    this.session = options.session;
    this.profile = options.profile;
    this.seed = options.seed;
    this.immediate = options.immediate;
  }

  get id(): string {
    return this.session.id;
  }

  get status(): Session["status"] {
    return this.session.status;
  }

  snapshot(): Session {
    return cloneSession(this.session);
  }

  resume(): Session {
    if (this.session.status === "stopped") {
      throw new CollectorError("Cannot resume a stopped mock session.", "SESSION_ALREADY_STOPPED", {
        sessionId: this.session.id
      });
    }

    if (this.session.status === "failed") {
      throw new CollectorError("Cannot resume a failed mock session.", "SESSION_FAILED", {
        sessionId: this.session.id
      });
    }

    this.session.status = "running";
    return this.snapshot();
  }

  pause(): void {
    if (this.session.status === "stopped") {
      throw new CollectorError("Cannot pause a stopped mock session.", "SESSION_ALREADY_STOPPED", {
        sessionId: this.session.id
      });
    }

    this.session.status = "paused";
  }

  stop(): void {
    if (this.session.status === "stopped") {
      return;
    }

    this.session.status = "stopped";
    this.session.endedAt = Date.now();
  }

  stream(): AsyncIterable<MetricEvent> {
    if (this.session.status === "stopped") {
      throw new CollectorError("Cannot stream a stopped mock session.", "SESSION_ALREADY_STOPPED", {
        sessionId: this.session.id
      });
    }

    const options = {
      sessionId: this.session.id,
      deviceId: this.session.deviceId,
      targetId: this.session.targetId,
      profile: this.profile,
      seed: this.seed,
      sampleIntervalMs: this.session.sampleIntervalMs,
      immediate: this.immediate,
      shouldContinue: () => this.session.status !== "stopped" && this.session.status !== "failed",
      shouldEmit: () => this.session.status === "running"
    };

    if (this.session.startedAt !== undefined) {
      return createMockMetricGenerator({
        ...options,
        timestampMs: this.session.startedAt
      });
    }

    return createMockMetricGenerator(options);
  }
}
