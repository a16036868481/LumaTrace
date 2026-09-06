import { basename, dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Session } from "@lumatrace/core";
import {
  buildSessionOutputDirectory,
  sanitizeSessionFolderLabel,
  SESSION_REPORT_FOLDER_CREATED_AT_CONFIG_KEY,
  SESSION_REPORT_FOLDER_LABEL_CONFIG_KEY
} from "../src/services/SessionOutputDirectory";

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: "session-69e9e67d-6ace-4655-9f7c-e12345678abc",
    name: "Fallback test name",
    deviceId: "device-1",
    targetId: "target-1",
    sampleIntervalMs: 100,
    status: "stopped",
    ...overrides
  };
}

describe("per-test report output directory", () => {
  it("keeps a readable Unicode test label while removing unsafe path syntax", () => {
    expect(sanitizeSessionFolderLabel('  原神：测试 / <60FPS>?  ')).toBe("原神_测试_60FPS");
    expect(sanitizeSessionFolderLabel("../../")).toBe("Test");
    expect(sanitizeSessionFolderLabel("CON")).toBe("Test_CON");
  });

  it("creates one stable, unique subfolder from the target, creation time, and session", () => {
    const createdAtMs = new Date(2026, 7, 7, 3, 40, 35, 123).getTime();
    const input = session({
      config: {
        [SESSION_REPORT_FOLDER_LABEL_CONFIG_KEY]: "NIKKE",
        [SESSION_REPORT_FOLDER_CREATED_AT_CONFIG_KEY]: createdAtMs
      }
    });

    const reportRoot = join("workspace", "reports");
    const first = buildSessionOutputDirectory(reportRoot, input, createdAtMs + 1_000);
    const second = buildSessionOutputDirectory(reportRoot, input, createdAtMs + 60_000);

    expect(first).toBe(second);
    expect(dirname(first)).toBe(reportRoot);
    expect(basename(first)).toBe("NIKKE_2026-08-07_03-40-35-123_45678abc");
  });
});
