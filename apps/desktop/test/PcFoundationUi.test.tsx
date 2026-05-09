import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeviceDetailPage } from "../src/pages/DeviceDetail/DeviceDetailPage";
import { MetricCard } from "../src/components/MetricCard";

import "../src/styles/tokens.css";
import "../src/styles/globals.css";
import "../src/styles/layout.css";

function okJson(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
});

describe("PC Foundation UI", () => {
  it("renders Local PC processes, sanitized paths, and PresentMon status", async () => {
    window.history.replaceState({}, "", "/devices?deviceId=pc-local:windows");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/devices")) {
          return okJson([
            {
              id: "pc-local:windows",
              platform: "windows",
              name: "Local PC",
              connectionType: "local",
              osVersion: "Windows",
              capabilities: []
            }
          ]);
        }
        if (url.includes("/targets")) {
          return okJson([
            {
              id: "pc-windows-process:4321:4321-1777359600000",
              name: "Game.exe",
              type: "process",
              platform: "windows",
              pid: 4321,
              executablePath: "C:\\Users\\player\\Games\\Game.exe",
              tags: { processName: "Game.exe", runtimeId: "4321-1777359600000" }
            },
            {
              id: "pc-windows-process:9876:9876-1777359660000",
              name: "Editor.exe",
              type: "process",
              platform: "windows",
              pid: 9876,
              executablePath: "C:\\Program Files\\Editor\\Editor.exe",
              tags: { processName: "Editor.exe", runtimeId: "9876-1777359660000" }
            }
          ]);
        }
        if (url.includes("/api/capabilities")) {
          return okJson([
            {
              metricName: "fps",
              platform: "windows",
              status: "requires_tool",
              reason: "PresentMon required.",
              source: "PresentMon"
            }
          ]);
        }
        if (url.includes("/api/tools/status")) {
          return okJson([
            {
              toolName: "PresentMon",
              status: "missing",
              reason: "PresentMon was not found.",
              suggestedAction: "Install PresentMon or set LUMATRACE_PRESENTMON_PATH."
            }
          ]);
        }
        if (url.includes("/api/pc/pc-local%3Awindows/presentmon/status")) {
          return okJson({
            toolStatus: {
              toolName: "PresentMon",
              status: "missing",
              reason: "PresentMon was not found."
            },
            compatibility: {
              supportsTimedCapture: false,
              supportsOutputFile: false,
              supportsProcessIdFilter: false,
              warnings: ["Install PresentMon."]
            },
            limitations: ["CPU and memory continue when PresentMon is missing."]
          });
        }
        return okJson([]);
      })
    );

    render(<DeviceDetailPage />);

    expect(await screen.findByText("Local PC")).toBeTruthy();
    expect(await screen.findByText("Game.exe")).toBeTruthy();
    expect(screen.getByText("4321")).toBeTruthy();
    expect(screen.getByText(/C:\\Users\\<user>\\/)).toBeTruthy();
    expect(await screen.findByText(/PresentMon: missing/)).toBeTruthy();
    expect(await screen.findByText(/Windows log access group/)).toBeTruthy();
    expect(await screen.findByText("timed capture: N/A")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Search processes"), { target: { value: "editor" } });
    expect(screen.getByText("Editor.exe")).toBeTruthy();
    expect(screen.queryByText("Game.exe")).toBeNull();
  });

  it("shows PC CPU and memory values while FPS remains N/A", () => {
    render(
      <>
        <MetricCard
          title="CPU"
          value={12.5}
          unit="%"
          source="windows:process-times"
          precision="estimated"
          confidence="medium"
        />
        <MetricCard
          title="Memory"
          value={256}
          unit="MB"
          source="windows:process-memory"
          precision="estimated"
          confidence="high"
        />
        <MetricCard title="FPS" value={undefined} unit="fps" source="PresentMon" />
      </>
    );

    expect(screen.getByText("12.5%")).toBeTruthy();
    expect(screen.getByText("256.0 MB")).toBeTruthy();
    expect(screen.getByText("source: windows:process-times")).toBeTruthy();
    expect(screen.getByText("source: windows:process-memory")).toBeTruthy();
    expect(screen.getAllByText("N/A").length).toBeGreaterThan(0);
  });
});
