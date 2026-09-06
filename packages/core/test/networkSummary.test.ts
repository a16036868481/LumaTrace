import { describe, expect, it } from "vitest";
import { buildReportSummary } from "../src/stats/summary";

describe("network report summary", () => {
  it("summarizes network delta byte metrics without fabricating missing fields", () => {
    const summary = buildReportSummary({
      events: [
        {
          sessionId: "s1",
          timestampMs: 1000,
          deviceId: "d1",
          targetId: "t1",
          metricName: "network_rx_bytes",
          value: 1024 * 1024,
          unit: "bytes",
          source: "adb:dumpsys netstats detail",
          precision: "estimated",
          confidence: "medium",
          tags: { intervalMs: 1000 }
        },
        {
          sessionId: "s1",
          timestampMs: 1000,
          deviceId: "d1",
          targetId: "t1",
          metricName: "network_tx_bytes",
          value: 512 * 1024,
          unit: "bytes",
          source: "adb:dumpsys netstats detail",
          precision: "estimated",
          confidence: "medium",
          tags: { intervalMs: 1000 }
        }
      ]
    });

    expect(summary.networkRxMb).toBe(1);
    expect(summary.networkTxMb).toBe(0.5);
    expect(summary.avgFps).toBeUndefined();
  });

  it("summarizes Windows GPU, power, and explicit CPU/GPU temperature metrics", () => {
    const metric = (metricName: string, value: number, unit: string) => ({
      sessionId: "s1",
      timestampMs: 1000,
      deviceId: "d1",
      targetId: "t1",
      metricName,
      value,
      unit,
      source: "test",
      precision: "device_level" as const,
      confidence: "high" as const
    });
    const summary = buildReportSummary({
      events: [
        metric("gpu_utilization", 20, "%"),
        metric("gpu_utilization", 60, "%"),
        metric("power_w", 40, "W"),
        metric("power_w", 80, "W"),
        metric("cpu_temperature_c", 50, "C"),
        metric("cpu_temperature_c", 70, "C"),
        metric("gpu_temperature_c", 40, "C"),
        metric("gpu_temperature_c", 60, "C")
      ]
    });

    expect(summary.avgGpuPercent).toBe(40);
    expect(summary.peakGpuPercent).toBe(60);
    expect(summary.avgPowerW).toBe(60);
    expect(summary.peakPowerW).toBe(80);
    expect(summary.avgCpuTemperatureC).toBe(60);
    expect(summary.peakCpuTemperatureC).toBe(70);
    expect(summary.avgGpuTemperatureC).toBe(50);
    expect(summary.peakGpuTemperatureC).toBe(60);
  });
});
