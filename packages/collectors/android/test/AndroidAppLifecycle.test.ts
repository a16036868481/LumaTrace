import { describe, expect, it } from "vitest";
import { AndroidAppLifecycle } from "../src/lifecycle/AndroidAppLifecycle";
import { FakeSamplingAdbClient } from "./fakeAdbClient";

function createLifecycle(adbClient = new FakeSamplingAdbClient()): AndroidAppLifecycle {
  return new AndroidAppLifecycle({
    adbClient,
    serial: "R58M123ABC",
    packageName: "com.example.app",
    targetId: "android-package:com.example.app",
    deviceId: "android:R58M123ABC"
  });
}

describe("AndroidAppLifecycle", () => {
  it("discovers launcher activities", async () => {
    const lifecycle = createLifecycle();

    await expect(lifecycle.getLaunchers()).resolves.toEqual([
      expect.objectContaining({ componentName: "com.example.app/.MainActivity" })
    ]);
  });

  it("starts with a launcher and waits for PID", async () => {
    const adbClient = new FakeSamplingAdbClient();
    adbClient.pid = 23456;
    const lifecycle = createLifecycle(adbClient);

    const result = await lifecycle.startApp();

    expect(result).toMatchObject({
      ok: true,
      method: "am_start",
      launcherComponent: "com.example.app/.MainActivity",
      pid: 23456
    });
    expect(adbClient.startActivityCalls).toEqual(["com.example.app/.MainActivity"]);
    expect(adbClient.waitForPidCalls).toBe(1);
  });

  it("fails when no launcher exists and monkey fallback is disabled", async () => {
    const adbClient = new FakeSamplingAdbClient();
    adbClient.launcherActivities = [];
    const lifecycle = createLifecycle(adbClient);

    const result = await lifecycle.startApp({ allowMonkeyFallback: false });

    expect(result.ok).toBe(false);
    expect(result.method).toBe("none");
    expect(adbClient.monkeyLaunchCalls).toEqual([]);
  });

  it("uses monkey fallback only when explicitly enabled", async () => {
    const adbClient = new FakeSamplingAdbClient();
    adbClient.launcherActivities = [];
    adbClient.pid = 34567;
    const lifecycle = createLifecycle(adbClient);

    const result = await lifecycle.startApp({ allowMonkeyFallback: true });

    expect(result).toMatchObject({
      ok: true,
      method: "monkey",
      pid: 34567
    });
    expect(adbClient.monkeyLaunchCalls).toEqual(["com.example.app"]);
  });

  it("force-stops and can wait until PID disappears", async () => {
    const adbClient = new FakeSamplingAdbClient();
    adbClient.pid = 12345;
    const lifecycle = createLifecycle(adbClient);

    const result = await lifecycle.stopApp({ waitUntilStopped: true, pollIntervalMs: 1 });

    expect(result).toMatchObject({
      ok: true,
      method: "am_force_stop",
      stopped: true
    });
    expect(adbClient.forceStopCalls).toEqual(["com.example.app"]);
  });

  it("returns a clear result for command failures", async () => {
    const adbClient = new FakeSamplingAdbClient();
    adbClient.failMethods.add("startActivity");
    const lifecycle = createLifecycle(adbClient);

    const result = await lifecycle.startApp();

    expect(result.ok).toBe(false);
    expect(result.warnings).toContain("am start failed");
  });
});
