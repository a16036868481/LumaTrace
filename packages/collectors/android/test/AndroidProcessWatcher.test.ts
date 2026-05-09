import { describe, expect, it } from "vitest";
import { AndroidProcessWatcher } from "../src/lifecycle/AndroidProcessWatcher";
import { FakeSamplingAdbClient } from "./fakeAdbClient";

describe("AndroidProcessWatcher", () => {
  it("reports running for the same PID", async () => {
    const adbClient = new FakeSamplingAdbClient();
    adbClient.pid = 12345;
    const watcher = new AndroidProcessWatcher({
      adbClient,
      serial: "R58M123ABC",
      packageName: "com.example.app",
      initialPid: 12345
    });

    await expect(watcher.check()).resolves.toMatchObject({ status: "running", pid: 12345 });
  });

  it("reports missing and then rebound when a new PID appears", async () => {
    const adbClient = new FakeSamplingAdbClient();
    adbClient.pidQueue = [null, 23456];
    const watcher = new AndroidProcessWatcher({
      adbClient,
      serial: "R58M123ABC",
      packageName: "com.example.app",
      initialPid: 12345
    });

    await expect(watcher.check()).resolves.toMatchObject({ status: "missing", previousPid: 12345 });
    await expect(watcher.check()).resolves.toMatchObject({
      status: "rebound",
      previousPid: 12345,
      pid: 23456
    });
    expect(watcher.getCurrentPid()).toBe(23456);
  });

  it("reports stopped after rebind timeout", async () => {
    let now = 1000;
    const adbClient = new FakeSamplingAdbClient();
    adbClient.pid = null;
    const watcher = new AndroidProcessWatcher({
      adbClient,
      serial: "R58M123ABC",
      packageName: "com.example.app",
      initialPid: 12345,
      rebindTimeoutMs: 500,
      nowMs: () => now
    });

    await expect(watcher.check()).resolves.toMatchObject({ status: "missing" });
    now = 1601;
    await expect(watcher.check()).resolves.toMatchObject({ status: "stopped" });
  });
});
