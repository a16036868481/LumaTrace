import { describe, expect, it } from "vitest";
import { METRIC_NAMES, METRIC_UNITS, type ReportSummary } from "@lumatrace/core";
import { HtmlExporter, type ReportDocument } from "../src";

function document(metricCount = 2): ReportDocument {
  const summary: ReportSummary = {
    durationMs: 1000,
    avgFps: 58,
    onePercentLowFps: 52
  };
  return {
    version: "test",
    locale: "en-US",
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
        description: '"quoted"',
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
  it("outputs static escaped HTML with summary, markers, availability, and a conclusion", () => {
    const html = new HtmlExporter().export(document(), {
      includeRawMetricsInHtml: true,
      maxHtmlMetricRows: 10
    });

    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("LumaTrace · Test Results");
    expect(html).toContain("Average FPS");
    expect(html).toContain("&lt;script&gt;Session&lt;/script&gt;");
    expect(html).toContain("Device &amp; Test");
    expect(html).toContain("&lt;img&gt;");
    expect(html).toContain("Generated &lt;locally&gt;");
    expect(html).toContain("Performance Conclusion");
    expect(html).toContain(
      "Average FPS is 58, between 30 and 59.9 FPS. Performance is acceptable"
    );
    expect(html).toContain("1% Low is 52 FPS (89.66% of the average)");
    expect(html).not.toContain("Tool Status");
    expect(html).not.toContain("install &amp; retry");
    expect(html).not.toContain("Metric Samples");
    expect(html).not.toContain("&lt;tag&gt;");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("http://");
    expect(html).not.toContain("https://");
  });

  it("omits technical raw sections even when raw metrics are requested", () => {
    const html = new HtmlExporter().export(document(3), {
      includeRawMetricsInHtml: true,
      maxHtmlMetricRows: 1
    });

    expect(html).not.toContain("Showing metric rows");
    expect(html).not.toContain("Monotonic");
    expect(html).not.toContain("install &amp; retry");
    expect(html).toContain("<strong>N/A</strong>");
  });

  it("uses honest FPS performance bands and reports missing FPS without a rating", () => {
    const poor = document();
    poor.summary.avgFps = 29.5;
    poor.summary.onePercentLowFps = 15;
    const poorHtml = new HtmlExporter().export(poor);
    expect(poorHtml).toContain("Average FPS is 29.5, below 30 FPS. Performance is poor");
    expect(poorHtml).toContain("indicating noticeable frame-rate fluctuations");

    const good = document();
    good.summary.avgFps = 60;
    good.summary.onePercentLowFps = 55;
    expect(new HtmlExporter().export(good)).toContain(
      "Average FPS is 60, at or above 60 FPS. Performance is good"
    );

    const unavailable = document();
    delete unavailable.summary.avgFps;
    delete unavailable.summary.onePercentLowFps;
    const unavailableHtml = new HtmlExporter().export(unavailable);
    expect(unavailableHtml).toContain(
      "Average FPS was not collected, so this report cannot rate rendering performance."
    );
    expect(unavailableHtml).toContain(
      "There is not enough 1% Low data to assess frame-rate stability."
    );
  });
});
