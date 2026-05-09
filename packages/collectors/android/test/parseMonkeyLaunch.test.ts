import { describe, expect, it } from "vitest";
import { parseMonkeyLaunch } from "../src/parsers/parseMonkeyLaunch";
import { readAndroidFixture } from "./fixture";

describe("parseMonkeyLaunch", () => {
  it("parses a single-event monkey launch", () => {
    const result = parseMonkeyLaunch(readAndroidFixture("monkey_launch_success_sample.txt"));

    expect(result).toMatchObject({
      ok: true,
      eventsSent: 1,
      packageName: "com.example.app"
    });
  });

  it("recognizes no-activity failures", () => {
    const result = parseMonkeyLaunch(readAndroidFixture("monkey_launch_error_sample.txt"));

    expect(result.ok).toBe(false);
    expect(result.eventsSent).toBe(0);
    expect(result.warnings.some((warning) => warning.includes("No activities found"))).toBe(true);
  });

  it("handles unknown packages and malformed output", () => {
    expect(parseMonkeyLaunch("** Unknown package: com.example.missing").ok).toBe(false);
    const malformed = parseMonkeyLaunch("hello");
    expect(malformed.ok).toBe(false);
    expect(malformed.eventsSent).toBeUndefined();
  });
});
