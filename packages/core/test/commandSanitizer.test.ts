import { describe, expect, it } from "vitest";
import { sanitizeCommandLog, sanitizeCommandParts } from "../src/command/sanitizeCommandLog";

describe("sanitizeCommandLog", () => {
  it("redacts tokens, emails, user paths, and device-serial-like strings", () => {
    const input =
      "token=abc123 user=dev@example.com path=C:\\Users\\Alice\\secret\\trace.txt " +
      "home=/Users/bob/private/report.json serial=R58M1234ABC";
    const sanitized = sanitizeCommandLog(input);

    expect(sanitized).toContain("token=<redacted>");
    expect(sanitized).toContain("user=<email>");
    expect(sanitized).toContain("path=<user-path>");
    expect(sanitized).toContain("home=<user-path>");
    expect(sanitized).toContain("serial=<device-serial>");
    expect(sanitized).not.toContain("abc123");
    expect(sanitized).not.toContain("dev@example.com");
    expect(sanitized).not.toContain("Alice");
    expect(sanitized).not.toContain("bob");
    expect(sanitized).not.toContain("R58M1234ABC");
  });

  it("redacts explicit sensitive values and bearer tokens", () => {
    const sanitized = sanitizeCommandLog("Authorization: Bearer very.secret.token user secretValue", {
      sensitiveValues: ["secretValue"]
    });

    expect(sanitized).toContain("Bearer <token>");
    expect(sanitized).toContain("<redacted>");
    expect(sanitized).not.toContain("very.secret.token");
    expect(sanitized).not.toContain("secretValue");
  });

  it("sanitizes command parts without mutating package names by default", () => {
    const sanitized = sanitizeCommandParts("adb", [
      "-s",
      "R58M1234ABC",
      "shell",
      "cmd",
      "package",
      "com.example.app"
    ]);

    expect(sanitized).toBe("adb -s <device-serial> shell cmd package com.example.app");
  });
});
