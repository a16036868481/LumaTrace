import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../src/app/AppShell";
import { ApiError } from "../src/api/errors";
import { ApiErrorView } from "../src/components/ApiErrorView";
import { MetricCard } from "../src/components/MetricCard";

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
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
});

describe("basic desktop rendering", () => {
  it("renders AppShell and dashboard device data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/health")) {
          return ok({ status: "ok", version: "mvp-a", uptimeMs: 10 });
        }
        if (url.includes("/api/devices")) {
          return ok([
            {
              id: "pc-local:windows",
              platform: "windows",
              name: "Local PC",
              connectionType: "local",
              osVersion: "Windows Test OS",
              capabilities: []
            }
          ]);
        }
        return ok([]);
      })
    );

    render(<AppShell />);

    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeTruthy();
    expect(await screen.findByText("Local PC")).toBeTruthy();
  });

  it("renders ApiErrorView without stack traces", () => {
    render(
      <ApiErrorView
        error={
          new ApiError({
            code: "SESSION_NOT_FOUND",
            message: "Session not found"
          })
        }
      />
    );

    expect(screen.getByText("SESSION_NOT_FOUND")).toBeTruthy();
    expect(screen.queryByText(/stack/i)).toBeNull();
  });

  it("renders MetricCard values and N/A", () => {
    const { rerender } = render(<MetricCard title="FPS" value={58.2} unit="fps" source="mock" />);
    expect(screen.getByText("58.2 FPS")).toBeTruthy();
    expect(screen.getByText("source: mock")).toBeTruthy();

    rerender(<MetricCard title="CPU" value={undefined} unit="%" />);
    expect(screen.getByText("N/A")).toBeTruthy();
  });
});
