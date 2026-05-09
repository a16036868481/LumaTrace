import { describe, expect, it } from "vitest";
import { sanitizeIosTraceDiagnostic } from "../src/diagnostics/sanitizeIosTraceDiagnostic";

describe("sanitizeIosTraceDiagnostic", () => {
  it("redacts tokens, paths, emails, UDIDs, stack traces, and raw CSV fields", () => {
    const sanitized = sanitizeIosTraceDiagnostic({
      message:
        "Bearer abc.def user@example.com C:\\Users\\alice\\trace.csv /Users/bob/trace.csv 00008110-001C195E0E91801E",
      rawCsv: "Time,FPS\n0,60",
      nested: {
        websocket: "lumatrace-auth.secret-token",
        stack: "Error: boom\n    at fn (C:\\Users\\alice\\app.ts:1:1)"
      }
    }) as Record<string, unknown>;

    const text = JSON.stringify(sanitized);
    expect(text).not.toContain("abc.def");
    expect(text).not.toContain("user@example.com");
    expect(text).not.toContain("alice");
    expect(text).not.toContain("bob");
    expect(text).not.toContain("00008110");
    expect(text).not.toContain("Time,FPS");
    expect(text).toContain("<redacted>");
    expect(text).toContain("<user-path>");
  });

  it("truncates long text", () => {
    const sanitized = sanitizeIosTraceDiagnostic("x".repeat(5000));
    expect(String(sanitized).length).toBeLessThan(4200);
    expect(String(sanitized)).toContain("<truncated>");
  });
});
