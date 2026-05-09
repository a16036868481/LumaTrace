import { describe, expect, it } from "vitest";
import { packageToTarget } from "../src/types";
import { parsePackageList } from "../src/parsers/parsePackageList";
import { readAndroidFixture } from "./fixture";

describe("parsePackageList", () => {
  it("parses simple package names", () => {
    const result = parsePackageList(readAndroidFixture("pm_list_packages_sample.txt"));
    expect(result.packages.map((item) => item.packageName)).toEqual([
      "com.example.app",
      "com.example.game"
    ]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("parses package paths and maps to targets", () => {
    const result = parsePackageList(readAndroidFixture("pm_list_packages_with_paths_sample.txt"));
    expect(result.packages[0]).toMatchObject({
      packageName: "com.example.app",
      apkPath: "/data/app/~~abc/base.apk"
    });
    expect(packageToTarget(result.packages[0]!)).toMatchObject({
      id: "android-package:com.example.app",
      type: "app",
      platform: "android",
      packageName: "com.example.app"
    });
  });
});
