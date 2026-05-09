import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IosTraceImportPanel } from "../src/components/IosTraceImportPanel";

import "../src/styles/tokens.css";
import "../src/styles/globals.css";
import "../src/styles/layout.css";

function ok(data: unknown): Response {
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
});

describe("IosTraceImportPanel", () => {
  it("posts manual CSV import and shows sanitized result summary", async () => {
    const imported = vi.fn();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;

      return ok({
        status: "success",
        rawRowCount: 2,
        matchedRowCount: 2,
        metricCount: 6,
        matchStatus: "matched",
        matchConfidence: "high",
        reason: "Matched xctrace rows by bundle identifier.",
        warnings: [],
        diagnosticsId: "diag-1"
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <IosTraceImportPanel
        session={{
          id: "session-ios",
          name: "iOS",
          deviceId: "ios:device",
          targetId: "ios-app:device:com.example.game",
          sampleIntervalMs: 1000,
          status: "created"
        }}
        target={{
          id: "ios-app:device:com.example.game",
          name: "Example Game",
          type: "app",
          platform: "ios",
          bundleId: "com.example.game"
        }}
        onImported={imported}
      />
    );

    expect(screen.getByText(/does not start xctrace recording/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("xctrace CSV"), {
      target: {
        value: "Time (s),Process,Bundle Identifier,PID,FPS,Frame Time (ms)\n0,Example Game,com.example.game,42,60,16.67"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Import iOS Trace CSV" }));

    await waitFor(() => expect(imported).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/sessions/session-ios/ios/trace-import"),
      expect.objectContaining({ method: "POST" })
    );
    const firstCall = fetchMock.mock.calls[0];
    const body = JSON.parse(String(firstCall?.[1]?.body));
    expect(body).toMatchObject({
      target: {
        bundleId: "com.example.game"
      }
    });
    expect(await screen.findByText(/status: success/)).toBeTruthy();
    expect(screen.getByText(/metrics: 6/)).toBeTruthy();
    expect(screen.queryByText(/raw log/i)).toBeNull();
  });

  it("runs explicit automatic xctrace capture without exposing raw trace details", async () => {
    const imported = vi.fn();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void init;
      const url = String(input);
      if (url.includes("/ios/xctrace-capture")) {
        return ok({
          status: "trace_recorded",
          rawRowCount: 0,
          matchedRowCount: 0,
          metricCount: 0,
          reason: "Recorded an iOS xctrace file and exported the table of contents. Metric export XPath is not configured for this template yet.",
          warnings: ["Metric export XPath is not configured for this template yet."],
          diagnosticsId: "diag-capture"
        });
      }
      return ok({
        status: "success",
        rawRowCount: 1,
        matchedRowCount: 1,
        metricCount: 1,
        matchStatus: "matched",
        matchConfidence: "high",
        reason: "Matched xctrace rows by bundle identifier.",
        warnings: [],
        diagnosticsId: "diag-1"
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <IosTraceImportPanel
        session={{
          id: "session-ios",
          name: "iOS",
          deviceId: "ios:device",
          targetId: "ios-app:device:com.example.game",
          sampleIntervalMs: 1000,
          status: "created"
        }}
        target={{
          id: "ios-app:device:com.example.game",
          name: "Example Game",
          type: "app",
          platform: "ios",
          bundleId: "com.example.game"
        }}
        onImported={imported}
      />
    );

    expect(screen.getByText(/Experimental macOS\/Xcode path/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Run automatic xctrace capture" }));

    await waitFor(() => expect(imported).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/sessions/session-ios/ios/xctrace-capture"),
      expect.objectContaining({ method: "POST" })
    );
    const firstCall = fetchMock.mock.calls[0];
    const body = JSON.parse(String(firstCall?.[1]?.body));
    expect(body).toMatchObject({
      durationMs: 10000,
      target: {
        bundleId: "com.example.game"
      }
    });
    expect(await screen.findByText(/status: trace_recorded/)).toBeTruthy();
    expect(screen.getByText(/raw trace excluded from diagnostics/)).toBeTruthy();
    expect(screen.queryByText(/\.trace\/raw/i)).toBeNull();
  });
});
