import type { Device } from "../models/Device";
import type { MetricAvailability } from "../models/MetricAvailability";
import type { MetricEvent } from "../models/MetricEvent";
import type { Platform } from "../models/common";
import type { Session } from "../models/Session";
import type { Target } from "../models/Target";
import type { SessionConfig } from "./SessionConfig";

export interface MetricCollector {
  id: string;
  platform: Platform;

  discoverDevices(): Promise<Device[]>;

  listTargets(deviceId: string): Promise<Target[]>;

  getCapabilities(deviceId?: string): Promise<MetricAvailability[]>;

  startSession(config: SessionConfig): Promise<Session>;

  pauseSession(sessionId: string): Promise<void>;

  stopSession(sessionId: string): Promise<void>;

  streamMetrics(sessionId: string): AsyncIterable<MetricEvent>;
}
