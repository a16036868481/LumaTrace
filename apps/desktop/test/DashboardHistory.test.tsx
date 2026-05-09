import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "../src/pages/Dashboard/DashboardPage";
import { saveSessionHistoryEntry } from "../src/state/sessionHistoryPersistence";

function okJson(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("Dashboard session history", () => {
  it("shows recent sessions and actions", async () => {
    saveSessionHistoryEntry({
      sessionId: "s-history",
      name: "History Session",
      deviceId: "d1",
      targetId: "t1",
      status: "stopped",
      updatedAt: 1
    });
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(async () => undefined)
      }
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/health")) {
          return okJson({ status: "ok", version: "mvp-a", uptimeMs: 10 });
        }
        if (url.endsWith("/api/devices")) {
          return okJson([]);
        }
        if (url.includes("/api/sessions")) {
          return Promise.reject(new Error("offline"));
        }
        return okJson({});
      })
    );

    render(<DashboardPage />);

    expect(await screen.findByText("Recent Sessions")).toBeTruthy();
    expect(await screen.findByText("History Session")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Resume" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "View Report" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy sessionId" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("s-history");
  });
});
