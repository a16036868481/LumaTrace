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
});
