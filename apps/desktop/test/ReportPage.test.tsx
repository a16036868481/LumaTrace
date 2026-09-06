import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportPage } from "../src/pages/Report/ReportPage";
import { SESSION_HISTORY_STORAGE_KEY } from "../src/state/sessionHistoryPersistence";

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
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("ReportPage", () => {
  it("shows one focused empty state with a start action", async () => {
    window.history.replaceState({}, "", "/report");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => okJson([]))
    );

    render(<ReportPage />);

    expect(await screen.findByText("Ready for your first result")).toBeTruthy();
    expect(screen.getAllByText("No test results yet")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Start the first test" })).toBeTruthy();
  });

  it("shows a grouped report summary, honest unavailable states, charts, and export buttons", async () => {
    window.history.replaceState({}, "", "/report?sessionId=session-ui");
    localStorage.setItem(
      SESSION_HISTORY_STORAGE_KEY,
      JSON.stringify([
        {
          sessionId: "session-ui",
          name: "MVP-B UI Session",
          deviceId: "pc-local:windows",
          targetId: "pc-windows-process:123:runtime",
          targetName: "Example Game.exe",
          status: "stopped",
          startedAt: 1000,
          endedAt: 2200,
          updatedAt: 2200
        }
      ])
    );
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/sessions/session-ui/export") && init?.method === "POST") {
        return new Response("<!doctype html>", { status: 200 });
      }
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
            avgGpuPercent: 35,
            avgPowerW: 72.5,
            peakCpuTemperatureC: 64,
            peakGpuTemperatureC: 57,
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
            name: "MVP-B UI Session",
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
          name: "MVP-B UI Session",
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
    });
    vi.stubGlobal("fetch", fetchMock);
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

    expect((await screen.findAllByRole("heading", { name: "Test Results" })).length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Test results").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Example Game.exe").length).toBeGreaterThan(0);
    expect(screen.queryByText("MVP-B UI Session")).toBeNull();
    expect(screen.queryByText(/pc-windows-process:/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Refresh" })).toBeNull();
    expect(screen.queryByText("Recent tests")).toBeNull();
    expect(await screen.findByText("58.0 FPS")).toBeTruthy();
    expect(screen.getByText("35.0%")).toBeTruthy();
    expect(screen.getByText("72.5 W")).toBeTruthy();
    expect(screen.getByText("57.0 °C")).toBeTruthy();
    expect(screen.queryByText("CPU Temperature")).toBeNull();
    expect(screen.getByRole("heading", { name: "Smoothness and stability" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "App resource usage" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Device and network" })).toBeTruthy();
    expect(screen.getAllByText("Not collected").length).toBeGreaterThan(0);
    expect(screen.getByText("6 metrics collected · 5 not collected")).toBeTruthy();
    expect(screen.getByText("Core Metric Charts")).toBeTruthy();
    expect(screen.getByText("Export JSON")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    await waitFor(() => {
      expect(URL.createObjectURL).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Export HTML" }));
    await waitFor(() => {
      const localizedExportCall = fetchMock.mock.calls.find(
        ([input, init]) =>
          String(input).endsWith("/api/sessions/session-ui/export") && init?.method === "POST"
      );
      expect(localizedExportCall).toBeTruthy();
      expect(JSON.parse(String(localizedExportCall?.[1]?.body))).toMatchObject({
        format: "html",
        localization: {
          locale: "en-US",
          strings: {
            title: "Test Results"
          }
        }
      });
    });
  });

  it("deletes one result or clears every completed result after confirmation", async () => {
    window.history.replaceState({}, "", "/report?sessionId=session-one");
    let sessions = [
      {
        id: "session-one",
        name: "Alpha.exe",
        deviceId: "pc-local:windows",
        targetId: "pc-windows-process:1:alpha",
        sampleIntervalMs: 100,
        status: "stopped",
        startedAt: 1000,
        endedAt: 2000
      },
      {
        id: "session-two",
        name: "Beta.exe",
        deviceId: "pc-local:windows",
        targetId: "pc-windows-process:2:beta",
        sampleIntervalMs: 100,
        status: "stopped",
        startedAt: 3000,
        endedAt: 4000
      }
    ];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/sessions/session-one") && init?.method === "DELETE") {
        sessions = sessions.filter((session) => session.id !== "session-one");
        return okJson({ sessionId: "session-one", deleted: true });
      }
      if (url.endsWith("/api/sessions") && init?.method === "DELETE") {
        const deletedCount = sessions.length;
        sessions = [];
        return okJson({ deletedCount, skippedSessionIds: [] });
      }
      if (url.includes("/api/sessions?")) {
        return okJson(sessions);
      }
      if (url.endsWith("/report")) {
        return okJson({
          summary: { durationMs: 1000 },
          cached: true,
          rawMetricCount: 0
        });
      }
      if (url.endsWith("/markers") || url.includes("/metrics?")) {
        return okJson([]);
      }
      const session = sessions.find((item) => url.endsWith(`/api/sessions/${item.id}`));
      return okJson(session ?? {});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ReportPage />);

    expect((await screen.findAllByText("Alpha.exe")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Beta.exe").length).toBeGreaterThan(0);
    expect(screen.queryByText("Recent Test Results")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Delete Alpha.exe" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Delete this test result?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.queryByText("Alpha.exe")).toBeNull();
    });
    expect(screen.getAllByText("Beta.exe").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(screen.getByText("Delete all test results?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete all" }));

    expect(await screen.findByText("No test results yet")).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith("/api/sessions/session-one") && init?.method === "DELETE"
      )
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) => String(input).endsWith("/api/sessions") && init?.method === "DELETE"
      )
    ).toBe(true);
  });
});
