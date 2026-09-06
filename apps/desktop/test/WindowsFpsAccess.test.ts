import { afterEach, describe, expect, it, vi } from "vitest";
import {
  enableWindowsFpsAccess,
  getWindowsFpsAccessStatus,
  isFpsAccessCancellation
} from "../src/tauri/windowsFpsAccess";

afterEach(() => {
  delete window.__TAURI__;
  vi.restoreAllMocks();
});

describe("Windows FPS access bridge", () => {
  it("stays unsupported in the browser without requesting elevation", async () => {
    await expect(getWindowsFpsAccessStatus()).resolves.toMatchObject({
      supported: false,
      state: "unsupported",
      ready: false
    });
  });

  it("uses only the fixed status and enable commands", async () => {
    const invokeMock = vi.fn((command: string, args?: Record<string, unknown>): Promise<unknown> => {
      void args;
      return Promise.resolve(
        {
          supported: true,
          state: command === "enable_windows_fps_access" ? "restart_required" : "needs_setup",
          ready: false,
          configured: command === "enable_windows_fps_access",
          requiresSignOut: command === "enable_windows_fps_access",
          canEnable: command !== "enable_windows_fps_access"
        }
      );
    });
    const invoke = <T,>(command: string, args?: Record<string, unknown>): Promise<T> =>
      invokeMock(command, args) as Promise<T>;
    window.__TAURI__ = { core: { invoke } };

    await expect(getWindowsFpsAccessStatus()).resolves.toMatchObject({ state: "needs_setup" });
    await expect(enableWindowsFpsAccess()).resolves.toMatchObject({ state: "restart_required" });
    expect(invokeMock.mock.calls.map(([command]) => command)).toEqual([
      "get_windows_fps_access_status",
      "enable_windows_fps_access"
    ]);
    expect(invokeMock.mock.calls.every(([, args]) => args === undefined)).toBe(true);
  });

  it("distinguishes a cancelled UAC prompt from an implementation failure", () => {
    expect(isFpsAccessCancellation("fps_access_uac_cancelled")).toBe(true);
    expect(isFpsAccessCancellation("fps_access_helper_failed")).toBe(false);
  });
});
