import { describe, expect, it } from "vitest";
import { sanitizePcDiagnostic, sanitizePcText } from "../src";

describe("sanitizePcDiagnostic", () => {
  it("redacts paths, emails, tokens, command lines, and stack", () => {
    const sanitized = sanitizePcDiagnostic({
      path: "C:\\Users\\bob\\AppData\\Local\\x",
      email: "dev@example.com",
      token: "token=secret",
      commandLine: "Game.exe --password hunter2",
      stack: "at secret"
    });
    const text = JSON.stringify(sanitized);
    expect(text).toContain("<user-path>");
    expect(text).toContain("<email>");
    expect(text).toContain("token=<redacted>");
    expect(text).toContain("<redacted-command-line>");
    expect(text).not.toContain("stack");
  });

  it("truncates long text", () => {
    expect(sanitizePcText("x".repeat(5000))).toContain("<truncated>");
  });
});
