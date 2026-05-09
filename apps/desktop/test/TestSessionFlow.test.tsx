import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TestSessionPage } from "../src/pages/TestSession/TestSessionPage";

import "../src/styles/tokens.css";
import "../src/styles/globals.css";
import "../src/styles/layout.css";

class FlowWebSocket {
  static readonly CLOSED = 3;
  static readonly OPEN = 1;

  readyState = FlowWebSocket.OPEN;
  private readonly listeners: Record<string, Array<(event?: { data: string }) => void>> = {
    message: [],
    close: [],
    error: []
  };

  constructor(url: string) {
    void url;
    sockets.push(this);
  }

  addEventListener(type: string, listener: (event?: { data: string }) => void): void {
    this.listeners[type]?.push(listener);
  }

  close(): void {
    this.readyState = FlowWebSocket.CLOSED;
    for (const listener of this.listeners.close ?? []) {
      listener();
    }
  }

  message(payload: unknown): void {
    for (const listener of this.listeners.message ?? []) {
      listener({ data: JSON.stringify(payload) });
    }
  }
}

const sockets: FlowWebSocket[] = [];

function resetBrowserState(): void {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  sockets.length = 0;
  localStorage.clear();
  window.history.replaceState({}, "", "/session");
}

function ok(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: {
      "content-type": "application/json"
    }
  });
}

beforeEach(resetBrowserState);
afterEach(resetBrowserState);

describe("TestSessionPage flow", () => {
  it("creates, starts, displays metrics, adds marker, and stops", async () => {
    vi.stubGlobal("WebSocket", FlowWebSocket);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/devices/pc-local%3Awindows/targets")) {
          return ok([{ id: "pc-process:123", name: "Example Game", type: "process", platform: "windows" }]);
        }
        if (url.includes("/api/devices")) {
          return ok([
            {
              id: "pc-local:windows",
              platform: "windows",
              name: "Local PC",
              connectionType: "local",
              capabilities: []
            }
          ]);
        }
        if (url.endsWith("/api/sessions") && init?.method === "POST") {
          return ok({
            id: "session-ui",
            name: "MVP-B UI Session",
            deviceId: "pc-local:windows",
            targetId: "pc-process:123",
            sampleIntervalMs: 100,
            status: "created"
          });
        }
        if (url.includes("/start")) {
          return ok({
            id: "session-ui",
            name: "MVP-B UI Session",
            deviceId: "pc-local:windows",
            targetId: "pc-process:123",
            sampleIntervalMs: 100,
            status: "running"
          });
        }
        if (url.includes("/markers")) {
          return ok({
            id: "marker-1",
            sessionId: "session-ui",
            timestampMs: 1000,
            label: "Boss fight"
          });
        }
        if (url.includes("/stop")) {
          return ok({
            id: "session-ui",
            name: "MVP-B UI Session",
            deviceId: "pc-local:windows",
            targetId: "pc-process:123",
            sampleIntervalMs: 100,
            status: "stopped"
          });
        }
        if (url.includes("/api/sessions/session-ui/presentmon/status")) {
          return ok({
            status: "idle",
            updatedAt: 1000,
            warnings: [],
            diagnostics: []
          });
        }
        if (url.includes("/api/sessions/session-ui")) {
          return ok({
            id: "session-ui",
            name: "MVP-B UI Session",
            deviceId: "pc-local:windows",
            targetId: "pc-process:123",
            sampleIntervalMs: 100,
            status: "running"
          });
        }
        return ok([]);
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<TestSessionPage />);

    fireEvent.click(await screen.findByText("Windows"));
    expect(screen.queryByLabelText("Device")).toBeNull();
    expect(await screen.findByText("Example Game")).toBeTruthy();
    await waitFor(() =>
      expect((screen.getByRole("button", { name: "Start Test" }) as HTMLButtonElement).disabled).toBe(false)
    );

    fireEvent.click(screen.getByRole("button", { name: "Start Test" }));
    await waitFor(
      () =>
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining("/api/sessions/session-ui/start"),
          expect.objectContaining({ method: "POST" })
        ),
      { timeout: 5000 }
    );
    expect(await screen.findByText(/session-ui/, {}, { timeout: 5000 })).toBeTruthy();
    await waitFor(() => expect(sockets).toHaveLength(1));

    sockets[0]?.message({
      type: "metric",
      data: {
        sessionId: "session-ui",
        timestampMs: 1000,
        sequence: 1,
        deviceId: "pc-local:windows",
        targetId: "pc-process:123",
        metricName: "fps",
        value: 58,
        unit: "fps",
        source: "mock",
        precision: "estimated",
        confidence: "high"
      }
    });
    sockets[0]?.message({
      type: "metric",
      data: {
        sessionId: "session-ui",
        timestampMs: 1000,
        sequence: 2,
        deviceId: "pc-local:windows",
        targetId: "pc-process:123",
        metricName: "network_rx_bytes",
        value: 4096,
        unit: "bytes",
        source: "adb:/proc/net/dev",
        precision: "device_level",
        confidence: "low",
        tags: {
          scope: "device"
        }
      }
    });

    expect(await screen.findAllByText("58.0 FPS")).not.toHaveLength(0);
    expect(await screen.findAllByText("4,096.0 bytes")).not.toHaveLength(0);
    expect(screen.getByText(/Device-level network counters may include traffic from other apps/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Label"), { target: { value: "Boss fight" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Marker" }));
    expect(await screen.findAllByText("Boss fight")).not.toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "End Test" }));
    fireEvent.click(screen.getByRole("button", { name: "Stop Session" }));
    expect(await screen.findByRole("link", { name: "View Report" }, { timeout: 3000 })).toBeTruthy();
  }, 10000);

  it("keeps Android lifecycle and FPS options on safe defaults in the simple flow", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/devices/android%3Atest-device/targets")) {
        return ok([
          {
            id: "android-package:com.example.app",
            name: "com.example.app",
            type: "app",
            platform: "android",
            packageName: "com.example.app",
            tags: {
              launcherComponent: "com.example.app/.MainActivity",
              hasLauncher: true
            }
          }
        ]);
      }
      if (url.includes("/api/devices")) {
        return ok([
          {
            id: "android:test-device",
            platform: "android",
            name: "Android Test Device",
            connectionType: "usb",
            capabilities: []
          }
        ]);
      }
      if (url.includes("/api/android/android%3Atest-device/foreground-app")) {
        return ok({
          id: "android-package:com.example.app",
          name: "com.example.app",
          type: "app",
          packageName: "com.example.app",
          platform: "android",
          tags: {
            source: "adb_foreground_app",
            foregroundSource: "activity_top"
          }
        });
      }
      if (url.endsWith("/api/sessions") && init?.method === "POST") {
        return ok({
          id: "android-session",
          name: "MVP-B UI Session",
          deviceId: "android:test-device",
          targetId: "android-package:com.example.app",
          sampleIntervalMs: 100,
          status: "created",
          config: {
            enableExperimentalFps: true,
            enableRealtimeFps: true,
            fpsSampleIntervalMs: 1000,
            autoStartTarget: false,
            allowMonkeyFallback: false,
            stopTargetOnSessionStop: false,
            processMissingPolicy: "fail_session",
            launcherComponent: "com.example.app/.MainActivity"
          }
        });
      }
      if (url.includes("/start")) {
        return ok({
          id: "android-session",
          name: "MVP-B UI Session",
          deviceId: "android:test-device",
          targetId: "android-package:com.example.app",
          sampleIntervalMs: 100,
          status: "running",
          config: {
            enableExperimentalFps: true,
            enableRealtimeFps: true,
            fpsSampleIntervalMs: 1000,
            autoStartTarget: false,
            allowMonkeyFallback: false,
            stopTargetOnSessionStop: false,
            processMissingPolicy: "fail_session",
            launcherComponent: "com.example.app/.MainActivity"
          }
        });
      }
      return ok([]);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TestSessionPage />);

    fireEvent.click(await screen.findByText("Android"));
    expect(await screen.findByText("Android Test Device")).toBeTruthy();
    expect(await screen.findByText("Current app on phone")).toBeTruthy();
    expect(screen.queryByText(/Android FPS is experimental/)).toBeNull();
    expect(screen.queryByRole("checkbox", { name: /Enable stop-time experimental FPS probe/i })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: /Start App before session when PID is missing/i })).toBeNull();
    expect(screen.queryByLabelText("Process Missing Policy")).toBeNull();
    expect(screen.getByLabelText("Sample Interval")).toBeTruthy();
    await waitFor(() =>
      expect((screen.getByRole("button", { name: "Start Test" }) as HTMLButtonElement).disabled).toBe(false)
    );
    fireEvent.click(screen.getByRole("button", { name: "Start Test" }));

    expect(await screen.findByText("Detected package: com.example.app")).toBeTruthy();

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/sessions"),
        expect.objectContaining({
          method: "POST"
        })
      )
    );
    const createCall = fetchMock.mock.calls.find(
      ([input, init]) => String(input).endsWith("/api/sessions") && init?.method === "POST"
    );
    expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({
      config: {
        enableExperimentalFps: true,
        enableRealtimeFps: true,
        fpsSampleIntervalMs: 1000,
        autoStartTarget: false,
        allowMonkeyFallback: false,
        stopTargetOnSessionStop: false,
        processMissingPolicy: "fail_session"
      }
    });
  });

  it("uses simplified PC realtime FPS without showing advanced PresentMon controls", async () => {
    vi.stubGlobal("WebSocket", FlowWebSocket);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/devices/pc-local%3Awindows/targets")) {
        return ok([
          {
            id: "pc-windows-process:4321:4321-100",
            name: "Game.exe",
            type: "process",
            platform: "windows",
            pid: 4321,
            tags: { runtimeId: "4321-100" }
          }
        ]);
      }
      if (url.includes("/api/devices")) {
        return ok([
          {
            id: "pc-local:windows",
            platform: "windows",
            name: "Local PC",
            connectionType: "local",
            capabilities: [
              {
                metricName: "fps",
                platform: "windows",
                status: "experimental",
                source: "PresentMon",
                reason: "PresentMon explicit capture is experimental."
              }
            ]
          }
        ]);
      }
      if (url.endsWith("/api/sessions") && init?.method === "POST") {
        return ok({
          id: "pc-session",
          name: "MVP-B UI Session",
          deviceId: "pc-local:windows",
          targetId: "pc-windows-process:4321:4321-100",
          sampleIntervalMs: 100,
          status: "created",
          config: JSON.parse(String(init.body)).config
        });
      }
      if (url.includes("/start")) {
        return ok({
          id: "pc-session",
          name: "MVP-B UI Session",
          deviceId: "pc-local:windows",
          targetId: "pc-windows-process:4321:4321-100",
          sampleIntervalMs: 100,
          status: "running",
          config: JSON.parse(String(init?.body ?? "{}")).config
        });
      }
      if (url.includes("/api/sessions/pc-session/presentmon/status")) {
        return ok({
          status: "planning",
          progressPercent: 10,
          updatedAt: 1000,
          captureDurationMs: 2000,
          warnings: [],
          diagnostics: []
        });
      }
      return ok([]);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TestSessionPage />);

    fireEvent.click(await screen.findByText("Windows"));
    expect(screen.queryByLabelText("Device")).toBeNull();
    expect(await screen.findByText("Game.exe (PID 4321)")).toBeTruthy();
    expect(screen.queryByText(/PresentMon availability: experimental/)).toBeNull();
    expect(screen.queryByRole("checkbox", { name: /Run explicit timed CSV capture/i })).toBeNull();
    expect(screen.queryByLabelText("PresentMon duration")).toBeNull();
    expect(screen.queryByLabelText("PresentMon target mode")).toBeNull();
    expect(screen.queryByLabelText("CSV retention mode")).toBeNull();
    expect(screen.getByLabelText("Sample Interval")).toBeTruthy();
    await waitFor(() =>
      expect((screen.getByRole("button", { name: "Start Test" }) as HTMLButtonElement).disabled).toBe(false)
    );
    fireEvent.click(screen.getByRole("button", { name: "Start Test" }));

    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find(
        ([input, init]) => String(input).endsWith("/api/sessions") && init?.method === "POST"
      );
      expect(createCall).toBeTruthy();
    });
    const createCall = fetchMock.mock.calls.find(
      ([input, init]) => String(input).endsWith("/api/sessions") && init?.method === "POST"
    );
    expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({
      config: {
        enablePresentMonCapture: false,
        enablePresentMonRealtime: true,
        presentMonCaptureDurationMs: 10000,
        presentMonRealtimeChunkMs: 1000,
        presentMonTargetMode: "pid",
        keepPresentMonCsv: false,
        presentMonRetentionMode: "delete_after_parse"
      }
    });
    expect(screen.queryByText(/PresentMon Capture Status/)).toBeNull();
  });

  it("filters Windows process targets by name", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/devices/pc-local%3Awindows/targets")) {
        return ok([
          { id: "pc-process:game", name: "Example Game", type: "process", platform: "windows" },
          { id: "pc-process:java", name: "java.exe", type: "process", platform: "windows" }
        ]);
      }
      if (url.includes("/api/devices")) {
        return ok([
          {
            id: "pc-local:windows",
            platform: "windows",
            name: "Local PC",
            connectionType: "local",
            capabilities: []
          }
        ]);
      }
      return ok([]);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TestSessionPage />);

    fireEvent.click(await screen.findByText("Windows"));
    const search = await screen.findByLabelText("Search app/process");
    fireEvent.change(search, { target: { value: "java" } });

    await waitFor(() => {
      expect(screen.getByRole("listbox", { name: "Application process" })).toBeTruthy();
      expect(screen.getByRole("option", { name: /java\.exe/ }).getAttribute("aria-selected")).toBe("true");
      expect(screen.queryByRole("option", { name: /Example Game/ })).toBeNull();
    });
  });
});
