import { describe, expect, it } from "vitest";
import { CollectorError, type ToolStatus } from "@lumatrace/core";
import { IosCollector } from "../src/IosCollector";
import type { IosAppInfo, IosDeviceInfo, IosToolClient, IosToolStatus } from "../src/types";

class FakeIosToolClient implements IosToolClient {
  constructor(
    private readonly status: ToolStatus,
    private readonly devices: IosDeviceInfo[] = [],
    private readonly apps: IosAppInfo[] = []
  ) {}

  async getToolStatus(): Promise<IosToolStatus> {
    return {
      toolStatus: this.status,
      ...(this.status.status === "available" ? { xcrunPath: "/usr/bin/xcrun" } : {})
    };
  }

  async listDevices(): Promise<IosDeviceInfo[]> {
    return this.devices;
  }

  async listSimulatorApps(): Promise<IosAppInfo[]> {
    return this.apps;
  }
}

describe("IosCollector", () => {
  it("returns no devices when xcrun is unavailable", async () => {
    const collector = new IosCollector({
      platform: "win32",
      toolClient: new FakeIosToolClient({
        toolName: "xcrun",
        status: "unsupported",
        reason: "requires macOS"
      })
    });
    expect(await collector.discoverDevices()).toEqual([]);
    const capabilities = await collector.getCapabilities();
    expect(capabilities.find((capability) => capability.metricName === "ios.device_discovery")?.status).toBe(
      "requires_xcode"
    );
  });

  it("discovers sanitized iOS devices and simulator targets", async () => {
    const collector = new IosCollector({
      platform: "darwin",
      toolClient: new FakeIosToolClient(
        {
          toolName: "xcrun",
          status: "available",
          version: "70",
          reason: "available"
        },
        [
          {
            udid: "00008110-001C195E0E91801E",
            name: "QA iPhone",
            osVersion: "17.5",
            deviceType: "device"
          },
          {
            udid: "E2E4F6A8-1111-4222-9333-123456789ABC",
            name: "iPhone 15 Pro",
            osVersion: "17.4",
            deviceType: "simulator",
            state: "Booted"
          }
        ],
        [
          {
            bundleId: "com.example.game",
            displayName: "Example Game",
            applicationType: "User"
          }
        ]
      )
    });

    const devices = await collector.discoverDevices();
    expect(devices).toHaveLength(2);
    expect(devices[0]?.id).not.toContain("00008110");
    expect(devices[0]?.tags?.maskedUdid).toBe("0000...801E");
    expect(devices[1]?.connectionType).toBe("local");
    const targets = await collector.listTargets(devices[1]?.id ?? "");
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      bundleId: "com.example.game",
      platform: "ios",
      type: "app"
    });
  });

  it("does not list physical device app targets in foundation", async () => {
    const collector = new IosCollector({
      platform: "darwin",
      toolClient: new FakeIosToolClient(
        {
          toolName: "xcrun",
          status: "available"
        },
        [
          {
            udid: "00008110-001C195E0E91801E",
            name: "QA iPhone",
            deviceType: "device"
          }
        ],
        [
          {
            bundleId: "com.example.game"
          }
        ]
      )
    });
    const [device] = await collector.discoverDevices();
    expect(await collector.listTargets(device?.id ?? "")).toEqual([]);
  });

  it("fails session start clearly instead of emitting fake metrics", async () => {
    const collector = new IosCollector({
      platform: "darwin",
      toolClient: new FakeIosToolClient({
        toolName: "xcrun",
        status: "available"
      })
    });
    await expect(
      collector.startSession({
        name: "iOS",
        deviceId: "ios:device",
        targetId: "ios-app:device:com.example",
        sampleIntervalMs: 1000
      })
    ).rejects.toBeInstanceOf(CollectorError);
  });
});
