import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportPage } from "../src/pages/Report/ReportPage";

function okJson(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("Report details", () => {
  it("shows recent result summary, export buttons, charts, and N/A", async () => {
    window.history.replaceState({}, "", "/report?sessionId=s-report");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/report")) {
          return okJson({
            summary: {
              durationMs: 1200,
              avgFps: 58,
              jankCount: 2,
              networkRxMb: 1.5,
              networkTxMb: 0.5
            },
            cached: true,
            rawMetricCount: 5
          });
        }
        if (url.includes("/api/sessions?")) {
          return okJson([
            {
              id: "s-report",
              name: "Report Session",
              deviceId: "d1",
              targetId: "t1",
              sampleIntervalMs: 100,
              status: "stopped",
              startedAt: 100,
              endedAt: 1300
            }
          ]);
        }
        if (url.endsWith("/api/sessions/s-report")) {
          return okJson({
            id: "s-report",
            name: "Report Session",
            deviceId: "d1",
            targetId: "t1",
            sampleIntervalMs: 100,
            status: "stopped",
            startedAt: 100,
            endedAt: 1300
          });
        }
        if (url.endsWith("/markers")) {
          return okJson([
            {
              id: "m1",
              sessionId: "s-report",
              timestampMs: 200,
              label: "Boss fight",
              description: "Heavy scene"
            }
          ]);
        }
        if (url.includes("/metrics")) {
          return okJson([
            {
              sessionId: "s-report",
              timestampMs: 1000,
              deviceId: "d1",
              targetId: "t1",
              metricName: "network_rx_bytes",
              value: 1572864,
              unit: "bytes",
              source: "adb:/proc/net/dev",
              precision: "device_level",
              confidence: "low",
              tags: {
                platform: "android",
                scope: "device"
              }
            }
          ]);
        }
        return okJson({});
      })
    );

    render(<ReportPage />);

    expect(await screen.findByText("58.0 FPS")).toBeTruthy();
    expect(await screen.findByText("Core Metric Charts")).toBeTruthy();
    expect(screen.getByText(/Short reports use raw metric samples/)).toBeTruthy();
    expect(await screen.findByText("1.5 MB")).toBeTruthy();
    expect(screen.getAllByText("Report Session").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Export JSON" })).toBeTruthy();
    expect(screen.getAllByText("N/A").length).toBeGreaterThan(0);
  });

  it("shows PresentMon capture section without raw paths", async () => {
    window.history.replaceState({}, "", "/report?sessionId=pc-report");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/report")) {
          return okJson({
            summary: {
              durationMs: 1000,
              avgFps: 60,
              p95FrameTimeMs: 16.67
            },
            cached: true,
            rawMetricCount: 2
          });
        }
        if (url.includes("/api/sessions?")) {
          return okJson([
            {
              id: "pc-report",
              name: "PC Report",
              deviceId: "pc-local:windows",
              targetId: "pc-windows-process:4321:4321-100",
              sampleIntervalMs: 100,
              status: "stopped",
              startedAt: 100,
              endedAt: 1100
            }
          ]);
        }
        if (url.endsWith("/api/sessions/pc-report")) {
          return okJson({
            id: "pc-report",
            name: "PC Report",
            deviceId: "pc-local:windows",
            targetId: "pc-windows-process:4321:4321-100",
            sampleIntervalMs: 100,
            status: "stopped",
            startedAt: 100,
            endedAt: 1100
          });
        }
        if (url.endsWith("/markers")) {
          return okJson([]);
        }
        if (url.includes("/diagnostics")) {
          return okJson([
            {
              id: "diag-1",
              timestampMs: 1000,
              level: "info",
              category: "pc:presentmon",
              message: "PresentMon capture completed.",
              details: { outputFilePath: "C:\\Users\\<user>\\Temp\\capture.csv" }
            }
          ]);
        }
        if (url.includes("/metrics")) {
          return okJson([
            {
              sessionId: "pc-report",
              timestampMs: 1000,
              deviceId: "pc-local:windows",
              targetId: "pc-windows-process:4321:4321-100",
              metricName: "fps",
              value: 60,
              unit: "fps",
              source: "PresentMon:CSV",
              precision: "estimated",
              confidence: "high",
              tags: {
                platform: "windows",
                captureId: "capture",
                experimental: true
              }
            },
            {
              sessionId: "pc-report",
              timestampMs: 1000,
              deviceId: "pc-local:windows",
              targetId: "pc-windows-process:4321:4321-100",
              metricName: "frame_time_ms",
              value: 16.67,
              unit: "ms",
              source: "PresentMon:CSV",
              precision: "estimated",
              confidence: "high",
              tags: {
                platform: "windows",
                captureId: "capture",
                experimental: true
              }
            }
          ]);
        }
        return okJson({});
      })
    );

    render(<ReportPage />);

    expect((await screen.findAllByText("60.0 FPS")).length).toBeGreaterThan(0);
    expect(await screen.findByText("Core Metric Charts")).toBeTruthy();
    expect(screen.getAllByText("PC Report").length).toBeGreaterThan(0);
    expect(screen.queryByText(/C:\\Users\\player/)).toBeNull();
  });

  it("uses downsampled metric preview for long reports", async () => {
    window.history.replaceState({}, "", "/report?sessionId=long-report");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/report")) {
        return okJson({
          summary: {
            durationMs: 120_000,
            avgCpuPercent: 35
          },
          cached: true,
          rawMetricCount: 20_000
        });
      }
      if (url.includes("/api/sessions?")) {
        return okJson([
          {
            id: "long-report",
            name: "Long Report",
            deviceId: "d1",
            targetId: "t1",
            sampleIntervalMs: 100,
            status: "stopped",
            startedAt: 1000,
            endedAt: 121000
          }
        ]);
      }
      if (url.endsWith("/api/sessions/long-report")) {
        return okJson({
          id: "long-report",
          name: "Long Report",
          deviceId: "d1",
          targetId: "t1",
          sampleIntervalMs: 100,
          status: "stopped",
          startedAt: 1000,
          endedAt: 121000
        });
      }
      if (url.endsWith("/markers")) {
        return okJson([]);
      }
      if (url.includes("/metrics/downsampled")) {
        return okJson([
          {
            sessionId: "long-report",
            metricName: "cpu_percent",
            bucketStartMs: 1000,
            bucketEndMs: 2000,
            count: 10,
            avgValue: 30,
            source: "mock",
            precision: "estimated",
            tags: {
              downsampled: true,
              bucketSizeMs: 1000
            }
          },
          {
            sessionId: "long-report",
            metricName: "cpu_percent",
            bucketStartMs: 120000,
            bucketEndMs: 121000,
            count: 10,
            avgValue: 40,
            source: "mock",
            precision: "estimated",
            tags: {
              downsampled: true,
              bucketSizeMs: 1000
            }
          }
        ]);
      }
      if (url.includes("/metrics")) {
        return okJson([
          {
            sessionId: "long-report",
            timestampMs: 1000,
            deviceId: "d1",
            targetId: "t1",
            metricName: "cpu_percent",
            value: 30,
            unit: "%",
            source: "mock",
            precision: "estimated",
            confidence: "high"
          }
        ]);
      }
      return okJson({});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ReportPage />);

    expect(await screen.findByText(/20000 raw metric samples/)).toBeTruthy();
    expect(screen.getByText(/Long reports use bucket averages/)).toBeTruthy();
    expect(screen.getByText("chart source: downsampled")).toBeTruthy();
    expect(screen.getAllByText("points: 2").length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/sessions/long-report/metrics/downsampled"),
      expect.anything()
    );
  });
});
