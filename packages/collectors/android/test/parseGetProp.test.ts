import { describe, expect, it } from "vitest";
import { parseGetProp, getAndroidDeviceInfoFromProps } from "../src/parsers/parseGetProp";
import { readAndroidFixture } from "./fixture";

describe("parseGetProp", () => {
  it("parses standard getprop lines and device info", () => {
    const props = parseGetProp(readAndroidFixture("getprop_pixel_sample.txt"));
    expect(props["ro.product.model"]).toBe("Pixel 8");
    const info = getAndroidDeviceInfoFromProps(props, "fallback");
    expect(info).toMatchObject({
      name: "Pixel 8",
      osVersion: "Android 14 (SDK 34)",
      manufacturer: "Google",
      brand: "google",
      abi: "arm64-v8a",
      sdk: "34"
    });
  });

  it("ignores malformed and empty output", () => {
    expect(parseGetProp("bad\n")).toEqual({});
    expect(parseGetProp("")).toEqual({});
  });
});
