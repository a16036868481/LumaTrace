import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TestSessionPage } from "../src/pages/TestSession/TestSessionPage";
import { RealtimeMetricChart } from "../src/components/charts/RealtimeMetricChart";
import { ConnectionStatusBadge } from "../src/components/ConnectionStatusBadge";

function okJson(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("accessibility basics", () => {
  it("provides labels, named buttons, chart text, and badge text", async () => {
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
              capabilities: []
            }
          ]);
        }
        if (url.includes("/targets")) {
          return okJson([{ id: "pc-process:123", name: "Example Game", type: "process", platform: "windows" }]);
        }
        if (url.includes("/api/sessions")) {
          return okJson([]);
        }
        return okJson({});
      })
    );

    render(<TestSessionPage />);

    fireEvent.click(await screen.findByText("Windows"));

    expect(screen.queryByLabelText("Device")).toBeNull();
    expect(await screen.findByRole("listbox", { name: "Application process" })).toBeTruthy();
    expect(screen.getByLabelText("Search app/process")).toBeTruthy();
    expect(screen.getByLabelText("Sample Interval")).toBeTruthy();
    expect(screen.getByText(/Smaller numbers collect more often/)).toBeTruthy();
    expect(screen.queryByLabelText("Report Output Directory")).toBeNull();
    expect(screen.queryByRole("button", { name: "Set report folder" })).toBeNull();
    expect(screen.getByText("Advanced settings (optional)").closest("details")?.hasAttribute("open")).toBe(false);
    expect(screen.queryByLabelText("Session Name")).toBeNull();
    expect(screen.queryByLabelText("Profile")).toBeNull();
    const startButton = screen.getByRole("button", { name: "Start Test" }) as HTMLButtonElement;
    expect(startButton.disabled).toBe(true);
    fireEvent.click(screen.getByRole("option", { name: /Example Game/ }));
    expect(startButton.disabled).toBe(false);
    expect(screen.queryByRole("button", { name: "Keyboard shortcuts" })).toBeNull();

    render(
      <>
        <RealtimeMetricChart title="FPS chart" unit="fps" series={[]} />
        <ConnectionStatusBadge status="open" retryCount={0} />
      </>
    );
    expect(screen.getByRole("img", { name: "FPS chart" })).toBeTruthy();
    expect(screen.getByText(/Live connection.*connected/)).toBeTruthy();
  });
});
