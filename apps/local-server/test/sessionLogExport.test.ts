import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { DiagnosticRecord } from "@lumatrace/storage";
import { createServer } from "../src/server";
import {
  buildTimestampedSessionLog,
  shouldExportSessionLog
} from "../src/services/SessionLogExporter";
import { sanitizeSessionFolderLabel } from "../src/services/SessionOutputDirectory";

interface ApiSuccess<T> {
  ok: true;
  data: T;
}

function parsePayload<T>(payload: string): T {
  return (JSON.parse(payload) as ApiSuccess<T>).data;
}

describe("session log export", () => {
  it("is opt-in and removes credentials, email addresses, and local paths", () => {
    expect(shouldExportSessionLog(undefined)).toBe(false);
    expect(shouldExportSessionLog({ exportLogsToReportDir: false })).toBe(false);
    expect(shouldExportSessionLog({ exportLogsToReportDir: "true" })).toBe(false);
    expect(shouldExportSessionLog({ exportLogsToReportDir: true })).toBe(true);

    const diagnostics: DiagnosticRecord[] = [
      {
        id: "diag-secret",
        timestampMs: 1,
        level: "warn",
        category: "test",
        message:
          "Bearer secret-token-123 C:\\Users\\Alice\\private\\capture.log alice@example.com",
        details: {
          authToken: "secret-token-123",
          outputPath: "C:\\Users\\Alice\\private\\capture.log"
        }
      }
    ];
    const text = buildTimestampedSessionLog({
      diagnostics,
      generatedAtMs: 0
    });

    expect(text).toContain("1970-01-01T00:00:00.001Z WARN test");
    expect(text.trimStart().startsWith("{")).toBe(false);
    expect(text).not.toContain("secret-token-123");
    expect(text).not.toContain("C:\\Users\\Alice");
    expect(text).not.toContain("alice@example.com");
    expect(text).toContain("<local-path>");
    expect(text).toContain("<email>");
  });

  it("writes a log beside reports only when the session explicitly enables it", async () => {
    const root = await mkdtemp(join(tmpdir(), "lumatrace-session-log-"));
    const reportsDir = join(root, "reports");
    const app = await createServer({
      dbPath: join(root, "lumatrace.db"),
      reportsDir,
      enableAndroidCollector: false,
      enablePcCollector: false,
      enableLogger: false
    });

    try {
      const devices = parsePayload<Array<{ id: string }>>(
        (await app.inject({ method: "GET", url: "/api/devices" })).payload
      );
      const deviceId = devices[0]?.id ?? "";
      const targets = parsePayload<Array<{ id: string; name: string }>>(
        (await app.inject({ method: "GET", url: `/api/devices/${deviceId}/targets` })).payload
      );
      const targetId = targets[0]?.id ?? "";
      const targetName = targets[0]?.name ?? "";

      const runSession = async (exportLogsToReportDir?: boolean) => {
        const created = parsePayload<{ id: string }>(
          (
            await app.inject({
              method: "POST",
              url: "/api/sessions",
              payload: {
                deviceId,
                targetId,
                sampleIntervalMs: 1,
                ...(exportLogsToReportDir === undefined
                  ? {}
                  : { config: { exportLogsToReportDir } })
              }
            })
          ).payload
        );
        await app.inject({ method: "POST", url: `/api/sessions/${created.id}/start` });
        await app.inject({ method: "POST", url: `/api/sessions/${created.id}/stop` });
      };

      await runSession();
      const firstFolders = await readdir(reportsDir, { withFileTypes: true });
      expect(firstFolders).toHaveLength(1);
      expect(firstFolders[0]?.isDirectory()).toBe(true);
      expect(firstFolders[0]?.name.startsWith(`${sanitizeSessionFolderLabel(targetName)}_`)).toBe(
        true
      );
      expect((await readdir(join(reportsDir, firstFolders[0]?.name ?? ""))).sort()).toEqual([
        "report.csv",
        "report.html",
        "report.json"
      ]);

      await runSession(true);
      const allFolders = (await readdir(reportsDir, { withFileTypes: true })).filter((entry) =>
        entry.isDirectory()
      );
      expect(allFolders).toHaveLength(2);
      const folderContents = await Promise.all(
        allFolders.map(async (entry) => ({
          name: entry.name,
          files: (await readdir(join(reportsDir, entry.name))).sort()
        }))
      );
      expect(folderContents.every((entry) => entry.files.includes("report.html"))).toBe(true);
      const folderWithLog = folderContents.find((entry) =>
        entry.files.includes("windows-session.log")
      );
      expect(folderWithLog?.files).toEqual([
        "report.csv",
        "report.html",
        "report.json",
        "windows-session.log"
      ]);
      expect(
        await readFile(join(reportsDir, folderWithLog?.name ?? "", "windows-session.log"), "utf8")
      ).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z (INFO|WARN|ERROR) /mu);
    } finally {
      await app.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
