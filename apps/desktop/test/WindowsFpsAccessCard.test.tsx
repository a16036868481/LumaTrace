import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WindowsFpsAccessCard } from "../src/components/WindowsFpsAccessCard";
import { I18nProvider } from "../src/i18n/I18nProvider";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("WindowsFpsAccessCard", () => {
  it("offers one-time setup without blocking CPU and memory testing", () => {
    const onEnable = vi.fn();
    render(
      <I18nProvider>
        <WindowsFpsAccessCard
          busy={false}
          cancelled={false}
          status={{
            supported: true,
            state: "needs_setup",
            ready: false,
            configured: false,
            requiresSignOut: false,
            canEnable: true
          }}
          onEnable={onEnable}
          onRefresh={vi.fn()}
        />
      </I18nProvider>
    );

    expect(screen.getByText(/CPU and memory work now/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Enable FPS" }));
    expect(onEnable).toHaveBeenCalledTimes(1);
  });

  it("explains the required sign-out after setup and hides when ready", () => {
    const { rerender } = render(
      <I18nProvider>
        <WindowsFpsAccessCard
          busy={false}
          cancelled={false}
          status={{
            supported: true,
            state: "restart_required",
            ready: false,
            configured: true,
            requiresSignOut: true,
            canEnable: false
          }}
          onEnable={vi.fn()}
          onRefresh={vi.fn()}
        />
      </I18nProvider>
    );
    expect(screen.getByText(/Sign out of Windows/i)).toBeTruthy();

    rerender(
      <I18nProvider>
        <WindowsFpsAccessCard
          busy={false}
          cancelled={false}
          status={{
            supported: true,
            state: "ready",
            ready: true,
            configured: true,
            requiresSignOut: false,
            canEnable: false
          }}
          onEnable={vi.fn()}
          onRefresh={vi.fn()}
        />
      </I18nProvider>
    );
    expect(screen.queryByText(/FPS access enabled/i)).toBeNull();
  });
});
