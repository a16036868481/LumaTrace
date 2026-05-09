import { describe, expect, it } from "vitest";
import { parseProcStatus } from "../src/parsers/parseProcStatus";
import { readAndroidFixture } from "./fixture";

describe("parseProcStatus", () => {
  it("parses RSS and VmSize fields", () => {
    const parsed = parseProcStatus(readAndroidFixture("proc_pid_status_sample.txt"));
    expect(parsed).toMatchObject({
      rssKb: 98765,
      vmSizeKb: 456789,
      rssAnonKb: 76543,
      rssFileKb: 20000,
      rssShmemKb: 2222
    });
    expect(parsed.rssMb).toBeCloseTo(96.45, 2);
  });

  it("handles missing and malformed output", () => {
    expect(parseProcStatus("Name:\ttest\n")).toEqual({});
  });
});
