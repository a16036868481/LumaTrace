import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../src/i18n/I18nProvider";
import { ToolsDiagnosticsPage } from "../src/pages/ToolsDiagnostics/ToolsDiagnosticsPage";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("ToolsDiagnosticsPage", () => {
  it("shows only the repair and bug submission controls", async () => {
    localStorage.setItem("lumatrace.locale", "zh-CN");

    render(
      <I18nProvider>
        <ToolsDiagnosticsPage />
      </I18nProvider>
    );

    expect(await screen.findByRole("heading", { name: "修复/提交BUG" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "一键修复" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "提交 BUG" })).toBeTruthy();
    expect(screen.queryByText("Android 设备健康状态")).toBeNull();
    expect(screen.queryByText("PresentMon 兼容性")).toBeNull();
    expect(screen.queryByText("诊断记录")).toBeNull();
  });
});
