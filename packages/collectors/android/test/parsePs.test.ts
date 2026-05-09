import { describe, expect, it } from "vitest";
import { parsePsForPackage } from "../src/parsers/parsePs";
import { readAndroidFixture } from "./fixture";

describe("parsePsForPackage", () => {
  it("prefers exact toybox ps matches", () => {
    expect(parsePsForPackage(readAndroidFixture("ps_toybox_sample.txt"), "com.example.app")).toEqual({
      pid: 12345,
      processName: "com.example.app",
      matchType: "exact",
      confidence: "high"
    });
  });

  it("uses prefix service match with medium confidence", () => {
    expect(parsePsForPackage(readAndroidFixture("ps_busybox_sample.txt"), "com.example.game")).toEqual({
      pid: 22345,
      processName: "com.example.game:remote",
      matchType: "prefix",
      confidence: "medium"
    });
  });

  it("returns no match", () => {
    expect(parsePsForPackage(readAndroidFixture("ps_toybox_sample.txt"), "com.missing")).toEqual({
      pid: null,
      matchType: "none",
      confidence: "low"
    });
  });
});
