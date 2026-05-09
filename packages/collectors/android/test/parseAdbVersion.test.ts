import { describe, expect, it } from "vitest";
import { parseAdbVersion } from "../src/adb/parseAdbVersion";
import { readAndroidFixture } from "./fixture";

describe("parseAdbVersion", () => {
  it("parses version, build version, and installed path", () => {
    expect(parseAdbVersion(readAndroidFixture("adb_version_sample.txt"))).toEqual({
      version: "1.0.41",
      buildVersion: "35.0.2-12147458",
      installedAs: "C:\\Android\\platform-tools\\adb.exe"
    });
  });

  it("allows missing fields", () => {
    expect(parseAdbVersion("Android Debug Bridge version 1.0.39\n")).toEqual({
      version: "1.0.39"
    });
  });
});
