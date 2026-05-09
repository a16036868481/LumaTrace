import { describe, expect, it } from "vitest";
import { parsePidof } from "../src/parsers/parsePidof";
import { readAndroidFixture } from "./fixture";

describe("parsePidof", () => {
  it("parses single and multiple pids", () => {
    expect(parsePidof("12345\n")).toEqual({ pid: 12345, pids: [12345] });
    expect(parsePidof(readAndroidFixture("pidof_sample.txt"))).toEqual({
      pid: 12345,
      pids: [12345, 12346]
    });
  });

  it("returns null for empty or non numeric output", () => {
    expect(parsePidof(readAndroidFixture("pidof_empty_sample.txt"))).toEqual({ pid: null, pids: [] });
    expect(parsePidof("abc 123x")).toEqual({ pid: null, pids: [] });
  });
});
