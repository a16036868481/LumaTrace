import type { MetricEvent } from "@lumatrace/core";

export interface PcLongSessionSimulatorOptions {
  iterations: number;
  processMissingAt?: number;
  pidReusedAt?: number;
}

export interface PcLongSessionSimulationResult {
  metrics: MetricEvent[];
  diagnostics: string[];
}

export function simulatePcLongSession(options: PcLongSessionSimulatorOptions): PcLongSessionSimulationResult {
  const metrics: MetricEvent[] = [];
  const diagnostics: string[] = [];
  for (let index = 0; index < options.iterations; index += 1) {
    if (options.processMissingAt === index) {
      diagnostics.push("PROCESS_EXITED");
      continue;
    }
    if (options.pidReusedAt === index) {
      diagnostics.push("PID_REUSED");
      continue;
    }
    metrics.push({
      sessionId: "simulated-pc-session",
      timestampMs: index,
      monotonicMs: index,
      sequence: index,
      deviceId: "pc-local:windows",
      targetId: "pc-windows-process:4321:4321-100",
      metricName: "memory_mb",
      value: 256,
      unit: "MB",
      source: "windows:process-memory",
      precision: "estimated",
      confidence: "high",
      tags: {
        platform: "windows",
        pid: 4321
      }
    });
  }
  return { metrics, diagnostics };
}
