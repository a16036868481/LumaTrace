import { describe, expect, it } from "vitest";
import { parseForegroundApp } from "../src/parsers/parseForegroundApp";
import { readAndroidFixture } from "./fixture";

describe("parseForegroundApp", () => {
  it("parses dumpsys activity top ACTIVITY lines", () => {
    expect(parseForegroundApp(readAndroidFixture("dumpsys_activity_top_foreground_sample.txt"))).toMatchObject({
      packageName: "tv.danmaku.bili",
      activityName: ".MainActivityV2",
      componentName: "tv.danmaku.bili/.MainActivityV2",
      source: "activity_top",
      confidence: "medium"
    });
  });

  it("parses top resumed activity lines", () => {
    expect(
      parseForegroundApp(
        "topResumedActivity=ActivityRecord{123 u0 com.example.game/.MainActivity t99}"
      )
    ).toMatchObject({
      packageName: "com.example.game",
      source: "top_resumed_activity",
      confidence: "high"
    });
  });

  it("prefers resumed game activity over accelerator top activity", () => {
    expect(
      parseForegroundApp(
        [
          "ACTIVITY com.nn.accelerator.box/com.nn.libacc.accui.activity.GameAccOverviewActivity c004fc9 pid=9682",
          "topResumedActivity=ActivityRecord{323e553 u0 com.tencent.nrc/com.epicgames.ue4.GameActivity t3011}",
          "mFocusedApp=ActivityRecord{323e553 u0 com.tencent.nrc/com.epicgames.ue4.GameActivity t3011}"
        ].join("\n")
      )
    ).toMatchObject({
      packageName: "com.tencent.nrc",
      activityName: "com.epicgames.ue4.GameActivity",
      source: "top_resumed_activity",
      confidence: "high"
    });
  });

  it("ignores notification shade and returns no package", () => {
    const parsed = parseForegroundApp(readAndroidFixture("dumpsys_window_notification_shade_sample.txt"));
    expect(parsed.packageName).toBeUndefined();
    expect(parsed.warnings).toEqual(expect.arrayContaining(["No foreground Android app package could be parsed."]));
  });

  it("does not crash on malformed output", () => {
    const parsed = parseForegroundApp("mCurrentFocus=Window{bad data}");
    expect(parsed.packageName).toBeUndefined();
    expect(parsed.confidence).toBe("low");
  });
});
