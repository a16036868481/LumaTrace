import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportPage } from "../src/pages/Report/ReportPage";

import "../src/styles/tokens.css";
import "../src/styles/globals.css";
import "../src/styles/layout.css";

function okJson(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: {
      "content-type": "application/json"
    }
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("ReportPage", () => {
  it("shows recent result report summary, charts, N/A, and export buttons", async () => {
    window.history.replaceState({}, "", "/report?sessionId=session-ui");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/report")) {
          return okJson({
            summary: {
              durationMs: 1200,
              avgFps: 58,
              minFps: 45,
              maxFps: 60,
              p95FrameTimeMs: 24,
              p99FrameTimeMs: 40,
              jankCount: 2,
              severeJankCount: 1,
              avgCpuPercent: 42,
              peakMemoryMb: 650
            },
            cached: true,
            rawMetricCount: 20
          });
        }
        if (url.includes("/api/sessions?")) {
          return okJson([
            {
              id: "session-ui",
              name: "UI Test Result",
              deviceId: "pc-local:windows",
              targetId: "pc-windows-process:123:runtime",
              sampleIntervalMs: 100,
              status: "stopped",
              startedAt: 1000,
              endedAt: 2200
            }
          ]);
        }
        if (url.endsWith("/api/sessions/session-ui")) {
          return okJson({
            id: "session-ui",
            name: "UI Test Result",
            deviceId: "pc-local:windows",
            targetId: "pc-windows-process:123:runtime",
            sampleIntervalMs: 100,
            status: "stopped",
            startedAt: 1000,
            endedAt: 2200
          });
        }
        if (url.includes("format=json")) {
          return new Response(
            JSON.stringify({
              markers: [
                {
                  id: "m1",
                  sessionId: "session-ui",
                  timestampMs: 1000,
                  label: "Boss fight",
                  description: "Heavy scene"
                }
              ]
            }),
            { status: 200 }
          );
        }
        if (url.includes("format=csv")) {
          return new Response("timestampMs\n", { status: 200 });
        }
        if (url.includes("format=html")) {
          return new Response("<!doctype html>", { status: 200 });
        }
        return okJson({});
      })
    );
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:report")
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(() => undefined)
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    render(<ReportPage />);

    expect(await screen.findByText("Recent Test Results")).toBeTruthy();
    expect(screen.getAllByText("UI Test Result").length).toBeGreaterThan(0);
    expect(await screen.findByText("58.0 FPS")).toBeTruthy();
    expect(screen.getAllByText("N/A").length).toBeGreaterThan(0);
    expect(screen.getByText("Core Metric Charts")).toBeTruthy();
    expect(screen.getByText("Export JSON")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    await waitFor(() => {
      expect(URL.createObjectURL).toHaveBeenCalled();
    });
  });
});
