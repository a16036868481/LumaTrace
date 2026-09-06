import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BugReportPanel } from "../src/components/BugReportPanel";
import { I18nProvider } from "../src/i18n/I18nProvider";

afterEach(() => {
  cleanup();
  delete window.__TAURI__;
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("BugReportPanel", () => {
  it("runs one-click repair and opens the prepared GitHub bug form", async () => {
    localStorage.setItem("lumatrace.locale", "zh-CN");
    const invokeMock = vi.fn((command: string) => {
      expect(command).not.toBe("");
      return Promise.resolve(undefined);
    });
    const repairMock = vi.fn(() => Promise.resolve());
    window.__TAURI__ = {
      core: {
        invoke: <T,>(command: string) => invokeMock(command) as Promise<T>
      }
    };

    render(
      <I18nProvider>
        <BugReportPanel onRepair={repairMock} />
      </I18nProvider>
    );

    expect(await screen.findByRole("region", { name: "修复/提交BUG" })).toBeTruthy();
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByText("重启本地采集，并重新检测设备与工具。")).toBeTruthy();
    expect(screen.getByText("打开 GitHub BUG 表单，提交问题和截图。")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "一键修复" }));
    expect(await screen.findByText("修复完成，工具和设备状态已刷新。")).toBeTruthy();
    expect(repairMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "提交 BUG" }));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("open_bug_report_page");
    });
    expect(screen.queryByText(/github\.com\/a16036868481/)).toBeNull();
  });

  it("shows a clear fallback when automatic repair fails", async () => {
    localStorage.setItem("lumatrace.locale", "zh-CN");
    const repairMock = vi.fn(() => Promise.reject(new Error("restart failed")));

    render(
      <I18nProvider>
        <BugReportPanel onRepair={repairMock} />
      </I18nProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "一键修复" }));
    expect(await screen.findByText("自动修复未完成，可以提交 BUG 继续处理。")).toBeTruthy();
  });
});
