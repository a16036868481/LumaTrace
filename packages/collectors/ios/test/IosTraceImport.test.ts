import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { importIosXctraceCsvMetrics } from "../src/trace/IosTraceImport";

function fixture(name: string): string {
  return readFileSync(resolve("../../../tests/fixtures/ios", name), "utf8");
}

describe("importIosXctraceCsvMetrics", () => {
  it("returns parse warnings, match status, and mapped metrics", () => {
    const result = importIosXctraceCsvMetrics(fixture("xctrace_csv_malformed_sample.csv"), {
      sessionId: "session-ios",
      deviceId: "ios:device",
      targetId: "ios-app:device:com.example.game",
      target: {
        bundleId: "com.example.game"
      },
      importedAtMs: 1_700_000_000_000
    });

    expect(result.parse.rowCount).toBe(2);
    expect(result.match.status).toBe("matched");
    expect(result.metrics.length).toBeGreaterThan(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
