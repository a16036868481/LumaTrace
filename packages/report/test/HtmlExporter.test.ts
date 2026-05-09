import { describe, expect, it } from "vitest";
import { METRIC_NAMES, METRIC_UNITS, type ReportSummary } from "@lumatrace/core";
import { HtmlExporter, type ReportDocument } from "../src";

function document(metricCount = 2): ReportDocument {
  const summary: ReportSummary = {
    durationMs: 1000,
    avgFps: 58
  };
  return {
    version: "test",
    generatedAt: 1234,
    session: {
      id: "session-1",
      name: "<script>Session</script>",
      deviceId: "device-1",
      targetId: "target-1",
      sampleIntervalMs: 1000,
      status: "stopped"
    },
    device: {
      id: "device-1",
      platform: "windows",
      name: "Device & Test",
      connectionType: "local",
      capabilities: []
    },
    target: {
      id: "target-1",
      name: "Target <b>",
      type: "game",
      platform: "windows"
    },
    summary,
    markers: [
      {
        id: "marker-1",
        sessionId: "session-1",
        timestampMs: 1100,
        label: "<img>",
        description: "\"quoted\"",
        tags: {
          phase: "one"
        }
      }
    ],
    availability: [
      {
        metricName: "fps",
        platform: "windows",
        status: "experimental",
        source: "mock",
        reason: "Generated <locally>",
        suggestedAction: "N/A"
      }
    ],
    toolStatus: [
      {
        toolName: "adb",
        status: "missing",
        reason: "<missing>",
        suggestedAction: "install & retry"
      }
    ],
    rawMetricCount: metricCount,
    limitations: ["local <only>"],
    metrics: Array.from({ length: metricCount }, (_unused, index) => ({
      sessionId: "session-1",
      timestampMs: 1000 + index,
      sequence: index,
      deviceId: "device-1",
      targetId: "target-1",
      metricName: METRIC_NAMES.FPS,
      value: 60 - index,
      unit: METRIC_UNITS.FPS,
      source: "mock",
      precision: "estimated" as const,
      confidence: "high" as const,
      tags: {
        unsafe: "<tag>"
      }
    }))
  };
}

describe("HtmlExporter", () => {
  it("outputs static escaped HTML with summary, markers, and availability", () => {
    const html = new HtmlExporter().export(document(), {
      includeRawMetricsInHtml: true,
      maxHtmlMetricRows: 10
    });

    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("LumaTrace Report");
    expect(html).toContain("Avg FPS");
    expect(html).toContain("&lt;script&gt;Session&lt;/script&gt;");
    expect(html).toContain("Device &amp; Test");
    expect(html).toContain("&lt;img&gt;");
    expect(html).toContain("Generated &lt;locally&gt;");
    expect(html).toContain("install &amp; retry");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("http://");
    expect(html).not.toContain("https://");
  });

  it("limits raw metric rows and displays N/A for undefined summary values", () => {
    const html = new HtmlExporter().export(document(3), {
      includeRawMetricsInHtml: true,
      maxHtmlMetricRows: 1
    });

    expect(html).toContain("Showing first 1 of 3 metric rows.");
    expect((html.match(/<td>1000<\/td>/g) ?? []).length).toBe(1);
    expect(html).toContain("<strong>N/A</strong>");
  });
});
