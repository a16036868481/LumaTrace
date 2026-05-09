export interface Session {
  id: string;
  name: string;
  deviceId: string;
  targetId: string;
  startedAt?: number;
  endedAt?: number;
  sampleIntervalMs: number;
  status: "created" | "running" | "paused" | "stopped" | "failed";
  notes?: string[];
  config?: Record<string, unknown>;
}
