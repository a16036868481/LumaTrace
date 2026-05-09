import { describe, expect, it } from "vitest";
import { parseDumpsysPackageActivities } from "../src/parsers/parseDumpsysPackageActivities";
import { readAndroidFixture } from "./fixture";

describe("parseDumpsysPackageActivities", () => {
  it("parses a single MAIN/LAUNCHER activity", () => {
    const result = parseDumpsysPackageActivities(
      readAndroidFixture("dumpsys_package_activities_sample.txt")
    );

    expect(result.packageName).toBe("com.example.app");
    expect(result.activities).toEqual([
      expect.objectContaining({
        packageName: "com.example.app",
        activityName: "com.example.app.MainActivity",
        componentName: "com.example.app/.MainActivity",
        matchSource: "main_launcher",
        confidence: "high"
      })
    ]);
  });

  it("parses multiple launchers and excludes disabled activities", () => {
    const result = parseDumpsysPackageActivities(
      readAndroidFixture("dumpsys_package_activities_multiple_launchers_sample.txt")
    );

    expect(result.activities).toHaveLength(2);
    expect(result.activities.map((activity) => activity.componentName)).toEqual([
      "com.example.app/.MainActivity",
      "com.example.app/com.example.app.GameActivity"
    ]);
    expect(result.activities.some((activity) => activity.activityName === ".DisabledActivity")).toBe(false);
  });

  it("returns warnings when no launcher is present", () => {
    const result = parseDumpsysPackageActivities(
      readAndroidFixture("dumpsys_package_activities_no_launcher_sample.txt")
    );

    expect(result.packageName).toBe("com.example.headless");
    expect(result.activities).toEqual([]);
    expect(result.warnings).toContain("No enabled MAIN/LAUNCHER activity was parsed.");
  });

  it("supports explicit packageName fallback and malformed output", () => {
    const result = parseDumpsysPackageActivities("not a dumpsys package", {
      packageName: "com.example.app"
    });

    expect(result.packageName).toBe("com.example.app");
    expect(result.activities).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
