import type { Tags } from "../models/common";

export interface SessionConfig {
  id?: string;
  name: string;
  deviceId: string;
  targetId: string;
  sampleIntervalMs: number;
  metrics?: readonly string[];
  tags?: Tags;
  options?: Record<string, unknown>;
}
