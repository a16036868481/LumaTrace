import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportDirectorySelector } from "../src/components/ReportDirectorySelector";
import { I18nProvider } from "../src/i18n/I18nProvider";

afterEach(() => {
  delete window.__TAURI__;
  vi.restoreAllMocks();
});

describe("ReportDirectorySelector", () => {
  it("shows, changes, and opens the shared report directory", async () => {
    const invokeMock = vi.fn((command: string): Promise<unknown> => {
      if (command === "get_app_paths") {
        return Promise.resolve({
          dataDirSanitized: "%APPDATA%/LumaTrace",
          logsDirSanitized: "%APPDATA%/LumaTrace/logs",
          reportsDirSanitized: "%USERPROFILE%/LumaTrace/reports",
          diagnosticsDirSanitized: "%APPDATA%/LumaTrace/diagnostics"
        });
      }
      if (command === "choose_report_output_directory") {
        return Promise.resolve({
          cancelled: false,
          reportsDirSanitized: "D:/Performance Reports"
        });
      }
      return Promise.resolve(undefined);
    });
    window.__TAURI__ = {
      core: {
        invoke: <T,>(command: string) => invokeMock(command) as Promise<T>
      }
    };

    render(
      <I18nProvider>
        <ReportDirectorySelector />
      </I18nProvider>
    );

    expect(await screen.findByText("%USERPROFILE%/LumaTrace/reports")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Set report folder" }));
    expect(await screen.findByText("D:/Performance Reports")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open report folder" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("choose_report_output_directory");
      expect(invokeMock).toHaveBeenCalledWith("open_reports_directory");
    });
  });
});
