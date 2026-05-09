import { describe, expect, it } from "vitest";
import { parsePackageUid } from "../src/parsers/parsePackageUid";
import { readAndroidFixture } from "./fixture";

describe("parsePackageUid", () => {
  it("parses userId, appId, and uid", () => {
    expect(parsePackageUid(readAndroidFixture("dumpsys_package_uid_sample.txt"))).toEqual({
      uid: 10123,
      source: "userId",
      confidence: "high"
    });
    expect(parsePackageUid("appId=10124")).toEqual({
      uid: 10124,
      source: "appId",
      confidence: "high"
    });
    expect(parsePackageUid("uid=10125")).toEqual({
      uid: 10125,
      source: "uid",
      confidence: "medium"
    });
  });

  it("handles missing and malformed uid", () => {
    expect(parsePackageUid("no uid")).toEqual({ uid: null, confidence: "low" });
  });
});
