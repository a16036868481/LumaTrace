import type { MetricConfidence, MetricEvent, MetricPrecision, Tags } from "@lumatrace/core";

export interface AndroidSamplerContext {
  sessionId: string;
  deviceId: string;
  targetId: string;
  serial: string;
  pid: number;
  packageName: string;
  processName?: string;
  sampleIntervalMs: number;
  nowMs(): number;
  monotonicMs(): number;
  nextSequence(): number;
}

export function createAndroidMetricEvent(options: {
  context: AndroidSamplerContext;
  metricName: string;
  value: number | null;
  unit: string;
  source: string;
  precision: MetricPrecision;
  confidence: MetricConfidence;
  tags?: Tags;
  parserVersion?: string;
  timestampMs?: number;
  monotonicMs?: number;
}): MetricEvent {
  const event: MetricEvent = {
    sessionId: options.context.sessionId,
    timestampMs: options.timestampMs ?? options.context.nowMs(),
    monotonicMs: options.monotonicMs ?? options.context.monotonicMs(),
    sequence: options.context.nextSequence(),
    deviceId: options.context.deviceId,
    targetId: options.context.targetId,
    metricName: options.metricName,
    value: options.value,
    unit: options.unit,
    source: options.source,
    precision: options.precision,
    confidence: options.confidence
  };

  if (options.parserVersion !== undefined) {
    event.parserVersion = options.parserVersion;
  }
  event.tags = {
    platform: "android",
    pid: options.context.pid,
    packageName: options.context.packageName,
    sampleIntervalMs: options.context.sampleIntervalMs,
    ...(options.context.processName === undefined ? {} : { processName: options.context.processName }),
    ...(options.tags ?? {})
  };

  return event;
}
