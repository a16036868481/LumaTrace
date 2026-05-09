import { describe, expect, it } from "vitest";
import { sanitizeAndroidDiagnostic, sanitizeAndroidText } from "../src";

describe("sanitizeAndroidDiagnostic", () => {
  it("redacts serials, paths, emails, tokens, long output, and stack fields", () => {
    const sanitized = sanitizeAndroidDiagnostic(
      {
        serial: "ZX1G22ABCDEF",
        command: "adb -s ZX1G22ABCDEF shell dumpsys battery",
        email: "dev@example.com",
        path: "C:\\Users\\alice\\AppData\\Local\\Temp\\adb.txt",
        nested: {
          token: "token=super-secret",
          stdout: "x".repeat(5000),
          stack: "do not show"
        }
      },
      { serials: ["ZX1G22ABCDEF"] }
    ) as Record<string, unknown>;

    expect(JSON.stringify(sanitized)).not.toContain("ZX1G22ABCDEF");
    expect(JSON.stringify(sanitized)).not.toContain("dev@example.com");
    expect(JSON.stringify(sanitized)).not.toContain("C:\\Users\\alice");
    expect(JSON.stringify(sanitized)).not.toContain("super-secret");
    expect(JSON.stringify(sanitized)).not.toContain("do not show");
    expect(JSON.stringify(sanitized)).toContain("<truncated>");
  });

  it("keeps package names while redacting sensitive text", () => {
    const text = sanitizeAndroidText("package=com.example.app token:abc /home/alice/tmp", {
      maxTextLength: 200
    });

    expect(text).toContain("com.example.app");
    expect(text).toContain("token:<redacted>");
    expect(text).toContain("<user-path>");
  });
});
