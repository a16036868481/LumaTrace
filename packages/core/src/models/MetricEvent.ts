import type { MetricConfidence, MetricPrecision, Tags } from "./common";

export interface MetricEvent {
  sessionId: string;
  timestampMs: number;
  monotonicMs?: number;
  sequence?: number;
  deviceId: string;
  targetId: string;
  metricName: string;
  value: number | null;
  unit: string;
  source: string;
  precision: MetricPrecision;
  confidence: MetricConfidence;
  parserVersion?: string;
  tags?: Tags;
}
