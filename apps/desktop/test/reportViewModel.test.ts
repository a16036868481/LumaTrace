import { describe, expect, it } from "vitest";
import { buildReportViewModel } from "../src/utils/reportViewModel";

describe("reportViewModel", () => {
  it("keeps missing fields as N/A and includes markers and mock notice", () => {
    const viewModel = buildReportViewModel({
      summary: {
        durationMs: 1000,
        avgFps: 60
      },
      markers: [
        {
          id: "m1",
          sessionId: "s1",
          timestampMs: 1,
          label: "Marker"
        }
      ],
      metrics: [
        {
          sessionId: "s1",
          timestampMs: 10,
          deviceId: "d1",
          targetId: "t1",
          metricName: "fps",
          value: 60,
          unit: "fps",
          source: "mock",
          precision: "estimated",
          confidence: "high"
        }
      ]
    });

    expect(viewModel.summaryItems.find((item) => item.label === "Network RX")?.value).toBe("N/A");
    expect(viewModel.markers).toHaveLength(1);
    expect(viewModel.timeline.metricCount).toBe(1);
    expect(viewModel.sourceNotice).toContain("Mock metrics");
  });

  it("surfaces device-level network notice without turning missing fields into zero", () => {
    const viewModel = buildReportViewModel({
      summary: {
        durationMs: 1000,
        networkRxMb: 2
      },
      metrics: [
        {
          sessionId: "s1",
          timestampMs: 10,
          deviceId: "d1",
          targetId: "t1",
          metricName: "network_rx_bytes",
          value: 2097152,
          unit: "bytes",
          source: "adb:/proc/net/dev",
          precision: "device_level",
          confidence: "low",
          tags: {
            platform: "android",
            scope: "device"
          }
        }
      ]
    });

    expect(viewModel.summaryItems.find((item) => item.label === "Network RX")?.value).toBe("2.0 MB");
    expect(viewModel.summaryItems.find((item) => item.label === "Network TX")?.value).toBe("N/A");
    expect(viewModel.sourceNotice).toContain("Device-level network");
  });
});
