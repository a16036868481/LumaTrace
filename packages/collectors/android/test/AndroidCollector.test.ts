import { describe, expect, it } from "vitest";
import type {
  AndroidAdbClientLike,
  AndroidAdbDevice,
  AndroidPackage
} from "../src/types";
import { AndroidCollector } from "../src/AndroidCollector";
import type {
  AndroidForceStopResult,
  AndroidMonkeyLaunchResult,
  AndroidPidWaitResult,
  AndroidStartActivityResult
} from "../src/lifecycle/AndroidLifecycleTypes";
import { parseAdbDevices } from "../src/adb/parseAdbDevices";
import { parseAmStart } from "../src/parsers/parseAmStart";
import { parseDumpsysPackageActivities } from "../src/parsers/parseDumpsysPackageActivities";
import { parseGetProp } from "../src/parsers/parseGetProp";
import { parseMonkeyLaunch } from "../src/parsers/parseMonkeyLaunch";
import { parsePackageList } from "../src/parsers/parsePackageList";
import { createPidWaitResult } from "../src/parsers/parsePidWait";
import { parseBattery } from "../src/parsers/parseBattery";
import { parseMeminfo } from "../src/parsers/parseMeminfo";
import { parseNetstatsDetailForUid } from "../src/parsers/parseNetstatsDetail";
import { parseProcPidStat } from "../src/parsers/parseProcPidStat";
import { parseProcNetDev } from "../src/parsers/parseProcNetDev";
import { parseProcStat } from "../src/parsers/parseProcStat";
import { parseProcStatus } from "../src/parsers/parseProcStatus";
import type { AndroidForegroundAppResult } from "../src/parsers/parseForegroundApp";
import { readAndroidFixture } from "./fixture";

class FakeAdbClient implements AndroidAdbClientLike {
  androidIds = new Map<string, string>();
  foregroundApp: AndroidForegroundAppResult = {
    packageName: "com.example.app",
    activityName: ".MainActivity",
    componentName: "com.example.app/.MainActivity",
    source: "activity_top",
    confidence: "high",
    warnings: []
  };

  constructor(
    private readonly devices: AndroidAdbDevice[],
    private readonly packages: AndroidPackage[] = parsePackageList(
      readAndroidFixture("pm_list_packages_sample.txt")
    ).packages
  ) {}

  async getVersion() {
    return { version: "1.0.41" };
  }

  async listDevices() {
    return this.devices;
  }

  async getProps() {
    return parseGetProp(readAndroidFixture("getprop_pixel_sample.txt"));
  }

  async getSecureAndroidId(serial: string) {
    return this.androidIds.get(serial);
  }

  async listPackages() {
    return this.packages;
  }

  async getPid() {
    return 12345;
  }

  async getPackageUid() {
    return 10123;
  }

  async readProcStat() {
    return parseProcStat(readAndroidFixture("proc_stat_sample_1.txt"));
  }

  async readProcPidStat() {
    return parseProcPidStat(readAndroidFixture("proc_pid_stat_sample_1.txt"));
  }

  async readProcStatus() {
    return parseProcStatus(readAndroidFixture("proc_pid_status_sample.txt"));
  }

  async readMeminfo() {
    return parseMeminfo(readAndroidFixture("dumpsys_meminfo_package_sample.txt"));
  }

  async readBattery() {
    return parseBattery(readAndroidFixture("dumpsys_battery_sample.txt"));
  }

  async readProcNetDev() {
    return parseProcNetDev(readAndroidFixture("proc_net_dev_sample_1.txt"));
  }

  async readNetstatsDetail() {
    return readAndroidFixture("dumpsys_netstats_detail_uid_sample.txt");
  }

  async readUidNetworkStats() {
    return parseNetstatsDetailForUid(readAndroidFixture("dumpsys_netstats_detail_uid_sample.txt"), 10123);
  }

  async readGfxinfoFramestats() {
    return readAndroidFixture("gfxinfo_framestats_sample.txt");
  }

  async clearGfxinfoFramestats() {
    return undefined;
  }

  async enableSurfaceFlingerTimestats() {
    return undefined;
  }

  async clearSurfaceFlingerTimestats() {
    return undefined;
  }

  async dumpSurfaceFlingerTimestats() {
    return readAndroidFixture("surfaceflinger_timestats_sample.txt");
  }

  async disableSurfaceFlingerTimestats() {
    return undefined;
  }

  async dumpSurfaceFlingerLayers() {
    return readAndroidFixture("surfaceflinger_layers_sample.txt");
  }

  async readSurfaceFlingerLatency() {
    return readAndroidFixture("surfaceflinger_latency_sample.txt");
  }

  async readDisplayRefreshRate() {
    return readAndroidFixture("display_refresh_rate_sample.txt");
  }

  async getForegroundApp() {
    return this.foregroundApp;
  }

  async getLauncherActivities() {
    return parseDumpsysPackageActivities(readAndroidFixture("dumpsys_package_activities_sample.txt"), {
      packageName: "com.example.app"
    }).activities;
  }

  async startActivity(): Promise<AndroidStartActivityResult> {
    return parseAmStart(readAndroidFixture("am_start_success_sample.txt"));
  }

  async launchPackageWithMonkey(): Promise<AndroidMonkeyLaunchResult> {
    return parseMonkeyLaunch(readAndroidFixture("monkey_launch_success_sample.txt"));
  }

  async forceStopPackage(): Promise<AndroidForceStopResult> {
    return {
      ok: true,
      method: "am_force_stop",
      durationMs: 1,
      warnings: [],
      rawOutput: ""
    };
  }

  async waitForPid(): Promise<AndroidPidWaitResult> {
    return createPidWaitResult({ pid: 12345, attempts: 1, durationMs: 1 });
  }
}

describe("AndroidCollector", () => {
  it("discovers authorized Android devices and package targets", async () => {
    const adbClient = new FakeAdbClient(parseAdbDevices(readAndroidFixture("adb_devices_one_device.txt")));
    const collector = new AndroidCollector({ adbClient });
    const devices = await collector.discoverDevices();
    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({
      platform: "android",
      name: "Pixel 8",
      osVersion: "Android 14 (SDK 34)",
      connectionType: "usb"
    });
    expect(devices[0]?.tags?.maskedSerial).toBe("R58M...3ABC");
    const targets = await collector.listTargets(devices[0]!.id);
    expect(targets.map((target) => target.packageName)).toEqual([
      "com.example.app",
      "com.example.game"
    ]);
  });

  it("returns unauthorized/offline devices with permission-aware capabilities", async () => {
    const devices = [
      ...parseAdbDevices(readAndroidFixture("adb_devices_unauthorized.txt")),
      ...parseAdbDevices(readAndroidFixture("adb_devices_offline.txt"))
    ];
    const collector = new AndroidCollector({ adbClient: new FakeAdbClient(devices) });
    const discovered = await collector.discoverDevices();
    expect(discovered).toHaveLength(2);
    expect(discovered[0]?.capabilities.some((item) => item.status === "requires_permission")).toBe(
      true
    );
    await expect(collector.listTargets(discovered[0]!.id)).rejects.toThrow("not authorized");
  });

  it("keeps distinct local Android emulators and hides duplicate endpoint aliases", async () => {
    const adbClient = new FakeAdbClient(
      parseAdbDevices(
        [
          "List of devices attached",
          "127.0.0.1:16384 device product:e3q model:SM_S9280 device:e3q transport_id:10",
          "127.0.0.1:16416 device product:Barry model:BRA_AL00 device:Barry transport_id:11",
          "127.0.0.1:7555 device product:e3q model:SM_S9280 device:e3q transport_id:5"
        ].join("\n")
      )
    );
    adbClient.androidIds.set("127.0.0.1:16384", "same-mumu-instance");
    adbClient.androidIds.set("127.0.0.1:7555", "same-mumu-instance");
    adbClient.androidIds.set("127.0.0.1:16416", "second-mumu-instance");
    const collector = new AndroidCollector({ adbClient });

    const discovered = await collector.discoverDevices();

    expect(discovered).toHaveLength(2);
    expect(discovered.map((device) => device.name)).toEqual([
      "MuMu 1 (127.0.0.1:16384)",
      "MuMu 2 (127.0.0.1:16416)"
    ]);
    expect(discovered.map((device) => device.tags?.localEmulatorEndpoint)).toEqual([
      "127.0.0.1:16384",
      "127.0.0.1:16416"
    ]);
    expect(collector.listDiagnostics({ code: "ADB_LOCAL_EMULATOR_ALIAS_DEDUPED" })).toHaveLength(1);
  });

  it("reports capabilities and starts Android 2B sessions for running targets", async () => {
    const collector = new AndroidCollector({
      adbClient: new FakeAdbClient(parseAdbDevices(readAndroidFixture("adb_devices_one_device.txt")))
    });
    const devices = await collector.discoverDevices();
    const targets = await collector.listTargets(devices[0]!.id);
    await expect(collector.getCapabilities()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ metricName: "android.device_discovery", status: "available" }),
        expect.objectContaining({ metricName: "cpu_percent", status: "available" }),
        expect.objectContaining({ metricName: "fps", status: "experimental" })
      ])
    );
    await expect(
      collector.startSession({
        id: "s1",
        name: "Android",
        deviceId: devices[0]!.id,
        targetId: targets[0]!.id,
        sampleIntervalMs: 1000
      })
    ).resolves.toMatchObject({ id: "s1", status: "running" });
    await collector.stopSession("s1");
  });

  it("detects the foreground app target for guided Android start", async () => {
    const adbClient = new FakeAdbClient(parseAdbDevices(readAndroidFixture("adb_devices_one_device.txt")));
    adbClient.foregroundApp = {
      packageName: "tv.danmaku.bili",
      activityName: ".MainActivityV2",
      componentName: "tv.danmaku.bili/.MainActivityV2",
      source: "activity_top",
      confidence: "high",
      warnings: []
    };
    const collector = new AndroidCollector({ adbClient });
    const [device] = await collector.discoverDevices();

    await expect(collector.getForegroundTarget(device!.id)).resolves.toMatchObject({
      id: "android-package:tv.danmaku.bili",
      name: "tv.danmaku.bili",
      packageName: "tv.danmaku.bili",
      tags: expect.objectContaining({
        source: "adb_foreground_app",
        foregroundSource: "activity_top"
      })
    });
  });

  it("rejects Android Settings as a guided foreground target", async () => {
    const adbClient = new FakeAdbClient(parseAdbDevices(readAndroidFixture("adb_devices_one_device.txt")));
    adbClient.foregroundApp = {
      packageName: "com.android.settings",
      activityName: ".SubSettings",
      componentName: "com.android.settings/.SubSettings",
      source: "activity_top",
      confidence: "high",
      warnings: []
    };
    const collector = new AndroidCollector({ adbClient });
    const [device] = await collector.discoverDevices();

    await expect(collector.getForegroundTarget(device!.id)).rejects.toMatchObject({
      code: "TARGET_NOT_TEST_APP"
    });
  });
});
