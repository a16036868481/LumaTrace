import { describe, expect, it } from "vitest";
import { analyzePresentMonPermissionOutput } from "../src";
import { readPcFixture } from "./fixture";

describe("PresentMonPermissionDiagnostics", () => {
  it("detects permission limited capture without exposing stack or path text", () => {
    const result = analyzePresentMonPermissionOutput(
      `${readPcFixture("presentmon_console_permission_warning.txt")}\nC:\\Users\\alice\\secret\\capture.csv`
    );
    expect(result.permissionLimited).toBe(true);
    expect(result.warnings.join(" ")).toMatch(/permission/i);
    expect(result.warnings.join(" ")).not.toMatch(/alice/);
  });

  it("detects unknown target process warnings", () => {
    const result = analyzePresentMonPermissionOutput("Could not resolve unknown process for capture.");
    expect(result.permissionLimited).toBe(false);
    expect(result.warnings.join(" ")).toMatch(/target process/i);
  });
});
