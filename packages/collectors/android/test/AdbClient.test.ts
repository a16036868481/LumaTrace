import { describe, expect, it } from "vitest";
import type { CommandResult, CommandRunnerOptions } from "@lumatrace/core";
import {
  AdbClient,
  formatLogcatSinceTime,
  resolveDefaultAdbPath,
  type CommandRunnerLike
} from "../src/adb/AdbClient";
import {
  discoverReachableLocalAndroidEmulatorSerials,
  isKnownMumuAdbPort,
  parseLocalhostAdbPort,
  parseLocalAndroidEmulatorPorts
} from "../src/adb/LocalAndroidEmulatorDiscovery";
import { readAndroidFixture } from "./fixture";

function result(stdout: string, exitCode = 0, stderr = ""): CommandResult {
  return {
    command: "adb",
    args: [],
    stdout,
    stderr,
    exitCode,
    signal: null,
    startTimeMs: 1,
    durationMs: 1,
    timedOut: false,
    aborted: false,
    maxOutputBytes: 1024,
    stdoutTruncated: false,
    stderrTruncated: false,
    sanitizedCommand: "adb",
    sanitizedStdout: stdout,
    sanitizedStderr: stderr
  };
}

class FakeRunner implements CommandRunnerLike {
  readonly calls: CommandRunnerOptions[] = [];
  private readonly outputs: Map<string, CommandResult>;

  constructor(outputs: Record<string, CommandResult>) {
    this.outputs = new Map(Object.entries(outputs));
  }

  async run(options: CommandRunnerOptions): Promise<CommandResult> {
    this.calls.push(options);
    return this.outputs.get((options.args ?? []).join(" ")) ?? result("", 0);
  }
}

describe("AdbClient", () => {
  it("resolves adb from explicit and Android SDK environment paths", () => {
    expect(
      resolveDefaultAdbPath(
        { LUMATRACE_ADB_PATH: "D:\\tools\\adb.exe" },
        "win32",
        () => false
      )
    ).toBe("D:\\tools\\adb.exe");
    expect(
      resolveDefaultAdbPath(
        { ANDROID_HOME: "C:\\Users\\tester\\AppData\\Local\\Android\\Sdk" },
        "win32",
        (filePath) => filePath.endsWith("\\platform-tools\\adb.exe")
      )
    ).toBe("C:\\Users\\tester\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe");
    expect(resolveDefaultAdbPath({}, "win32", () => false)).toBe("adb");
  });

  it("runs adb version and adb devices through CommandRunner", async () => {
    const runner = new FakeRunner({
      version: result(readAndroidFixture("adb_version_sample.txt")),
      "devices -l": result(readAndroidFixture("adb_devices_one_device.txt"))
    });
    const client = new AdbClient({ adbPath: "adb", commandRunner: runner });
    await expect(client.getVersion()).resolves.toMatchObject({ version: "1.0.41" });
    await expect(client.listDevices()).resolves.toHaveLength(1);
    expect(runner.calls.map((call) => call.args?.join(" "))).toEqual(["version", "devices -l"]);
  });

  it("auto-connects reachable local Android emulator endpoints before listing devices", async () => {
    const runner = new FakeRunner({
      "connect 127.0.0.1:7555": result("already connected to 127.0.0.1:7555"),
      "connect 127.0.0.1:16416": result("connected to 127.0.0.1:16416"),
      "devices -l": result(
        [
          "List of devices attached",
          "127.0.0.1:7555 device product:e3q model:SM_S9280 device:e3q transport_id:5",
          "127.0.0.1:16416 device product:Barry model:BRA_AL00 device:Barry transport_id:11"
        ].join("\n")
      )
    });
    const client = new AdbClient({
      commandRunner: runner,
      autoConnectLocalEmulators: true,
      localEmulatorPorts: [7555, 16416, 16448],
      localEmulatorPortProbe: async (port) => port !== 16448
    });

    await expect(client.listDevices()).resolves.toHaveLength(2);
    expect(runner.calls.map((call) => call.args?.join(" "))).toEqual([
      "connect 127.0.0.1:7555",
      "connect 127.0.0.1:16416",
      "devices -l"
    ]);
  });

  it("discovers local emulator serials from reachable configured ports only", async () => {
    expect(parseLocalAndroidEmulatorPorts("7555, 16416, bad, 70000")).toEqual([7555, 16416]);
    expect(parseLocalhostAdbPort("127.0.0.1:16416")).toBe(16416);
    expect(isKnownMumuAdbPort(16416)).toBe(true);
    expect(isKnownMumuAdbPort(62001)).toBe(false);
    await expect(
      discoverReachableLocalAndroidEmulatorSerials({
        platform: "win32",
        ports: [7555, 16416, 16448],
        isPortOpen: async (port) => port === 16416
      })
    ).resolves.toEqual(["127.0.0.1:16416"]);
    await expect(
      discoverReachableLocalAndroidEmulatorSerials({
        platform: "linux",
        ports: [16416],
        isPortOpen: async () => true
      })
    ).resolves.toEqual([]);
  });

  it("runs shell getprop and package list", async () => {
    const runner = new FakeRunner({
      "devices -l": result(readAndroidFixture("adb_devices_one_device.txt")),
      "-s R58M123ABC shell getprop": result(readAndroidFixture("getprop_pixel_sample.txt")),
      "-s R58M123ABC shell pm list packages": result(readAndroidFixture("pm_list_packages_sample.txt"))
    });
    const client = new AdbClient({ commandRunner: runner });
    await client.listDevices();
    await expect(client.getProps("R58M123ABC")).resolves.toHaveProperty("ro.product.model", "Pixel 8");
    await expect(client.listPackages("R58M123ABC")).resolves.toHaveLength(2);
  });

  it("exports target-filtered threadtime logcat through the bounded command policy", async () => {
    const startedAtMs = new Date(2026, 7, 9, 1, 2, 3, 4).getTime();
    const since = "08-09 01:02:03.004";
    const command = `-s R58M123ABC logcat -d -v threadtime -T ${since} --uid=10123`;
    const runner = new FakeRunner({
      "devices -l": result(readAndroidFixture("adb_devices_one_device.txt")),
      [command]: result(readAndroidFixture("logcat_threadtime_sample.txt"))
    });
    const client = new AdbClient({ commandRunner: runner });
    await client.listDevices();

    const logcat = await client.dumpLogcat("R58M123ABC", {
      startedAtMs,
      uid: 10123,
      pid: 12345
    });

    expect(formatLogcatSinceTime(startedAtMs)).toBe(since);
    expect(logcat.stdout).toContain("12345 12367 I Unity");
    expect(runner.calls.at(-1)).toMatchObject({
      args: ["-s", "R58M123ABC", "logcat", "-d", "-v", "threadtime", "-T", since, "--uid=10123"],
      timeoutMs: 15_000,
      maxOutputBytes: 8 * 1024 * 1024
    });
  });

  it("falls back from uid-filtered logcat to the target pid", async () => {
    const startedAtMs = new Date(2026, 7, 9, 1, 2, 3, 4).getTime();
    const since = "08-09 01:02:03.004";
    const runner = new FakeRunner({
      "devices -l": result(readAndroidFixture("adb_devices_one_device.txt")),
      [`-s R58M123ABC logcat -d -v threadtime -T ${since} --uid=10123`]: result(
        "",
        1,
        "unknown option --uid"
      ),
      [`-s R58M123ABC logcat -d -v threadtime -T ${since} --pid=12345`]: result(
        readAndroidFixture("logcat_threadtime_sample.txt")
      )
    });
    const client = new AdbClient({ commandRunner: runner });
    await client.listDevices();

    await expect(
      client.dumpLogcat("R58M123ABC", { startedAtMs, uid: 10123, pid: 12345 })
    ).resolves.toMatchObject({ exitCode: 0 });
    expect(runner.calls.at(-1)?.args).toEqual([
      "-s",
      "R58M123ABC",
      "logcat",
      "-d",
      "-v",
      "threadtime",
      "-T",
      since,
      "--pid=12345"
    ]);
  });

  it("falls back from pidof to ps", async () => {
    const runner = new FakeRunner({
      "devices -l": result(readAndroidFixture("adb_devices_one_device.txt")),
      "-s R58M123ABC shell pidof com.example.app": result("", 1),
      "-s R58M123ABC shell ps -A": result(readAndroidFixture("ps_toybox_sample.txt"))
    });
    const client = new AdbClient({ commandRunner: runner });
    await client.listDevices();
    await expect(client.getPid("R58M123ABC", "com.example.app")).resolves.toBe(12345);
  });

  it("rejects invalid package names and unauthorized devices", async () => {
    const runner = new FakeRunner({
      "devices -l": result(readAndroidFixture("adb_devices_unauthorized.txt"))
    });
    const client = new AdbClient({ commandRunner: runner });
    await client.listDevices();
    await expect(client.getPid("R58M123ABC", "com.example;bad")).rejects.toThrow(
      "Invalid Android package name"
    );
    await expect(client.getProps("R58M123ABC")).rejects.toThrow("unauthorized");
  });

  it("parses package uid and surfaces command failures", async () => {
    const runner = new FakeRunner({
      "devices -l": result(readAndroidFixture("adb_devices_one_device.txt")),
      "-s R58M123ABC shell dumpsys package com.example.app": result(
        readAndroidFixture("dumpsys_package_uid_sample.txt")
      ),
      "-s R58M123ABC shell dumpsys package com.example.missing": result("bad", 1, "not found")
    });
    const client = new AdbClient({ commandRunner: runner });
    await client.listDevices();
    await expect(client.getPackageUid("R58M123ABC", "com.example.app")).resolves.toBe(10123);
    await expect(client.getPackageUid("R58M123ABC", "com.example.missing")).rejects.toThrow(
      "dumpsys package"
    );
  });

  it("reads Android 2B sampling commands through CommandRunner", async () => {
    const runner = new FakeRunner({
      "devices -l": result(readAndroidFixture("adb_devices_one_device.txt")),
      "-s R58M123ABC shell cat /proc/stat": result(readAndroidFixture("proc_stat_sample_1.txt")),
      "-s R58M123ABC shell cat /proc/12345/stat": result(
        readAndroidFixture("proc_pid_stat_sample_1.txt")
      ),
      "-s R58M123ABC shell cat /proc/12345/status": result(
        readAndroidFixture("proc_pid_status_sample.txt")
      ),
      "-s R58M123ABC shell dumpsys meminfo com.example.app": result(
        readAndroidFixture("dumpsys_meminfo_package_sample.txt")
      ),
      "-s R58M123ABC shell dumpsys battery": result(readAndroidFixture("dumpsys_battery_sample.txt"))
    });
    const client = new AdbClient({ commandRunner: runner });
    await client.listDevices();

    await expect(client.readProcStat("R58M123ABC")).resolves.toMatchObject({ coreCount: 2 });
    await expect(client.readProcPidStat("R58M123ABC", 12345)).resolves.toMatchObject({ pid: 12345 });
    await expect(client.readProcStatus("R58M123ABC", 12345)).resolves.toMatchObject({
      rssMb: expect.any(Number)
    });
    await expect(client.readMeminfo("R58M123ABC", "com.example.app")).resolves.toMatchObject({
      totalPssMb: expect.any(Number)
    });
    await expect(client.readBattery("R58M123ABC")).resolves.toMatchObject({
      levelPercent: 85
    });

    expect(runner.calls.at(-1)?.args?.join(" ")).toBe("-s R58M123ABC shell dumpsys battery");
    expect(runner.calls.some((call) => call.timeoutMs === 5000 && call.maxOutputBytes === 2 * 1024 * 1024)).toBe(
      true
    );
  });

  it("rejects invalid pid values for proc reads", async () => {
    const runner = new FakeRunner({
      "devices -l": result(readAndroidFixture("adb_devices_one_device.txt"))
    });
    const client = new AdbClient({ commandRunner: runner });
    await client.listDevices();

    await expect(client.readProcPidStat("R58M123ABC", 0)).rejects.toThrow("Invalid Android process id");
    await expect(client.readProcStatus("R58M123ABC", -1)).rejects.toThrow("Invalid Android process id");
  });

  it("reads Android network commands through CommandRunner", async () => {
    const runner = new FakeRunner({
      "devices -l": result(readAndroidFixture("adb_devices_one_device.txt")),
      "-s R58M123ABC shell cat /proc/net/dev": result(readAndroidFixture("proc_net_dev_sample_1.txt")),
      "-s R58M123ABC shell dumpsys netstats detail": result(
        readAndroidFixture("dumpsys_netstats_detail_uid_sample.txt")
      )
    });
    const client = new AdbClient({ commandRunner: runner });
    await client.listDevices();

    await expect(client.readProcNetDev("R58M123ABC")).resolves.toMatchObject({
      includedInterfaces: ["wlan0", "rmnet_data0"]
    });
    await expect(client.readNetstatsDetail("R58M123ABC")).resolves.toContain("uid=10123");
    runner.calls.length = 1;
    await expect(client.readUidNetworkStats("R58M123ABC", 10123)).resolves.toMatchObject({
      uid: 10123,
      rxBytes: 12000,
      txBytes: 5000
    });
    expect(runner.calls.some((call) => call.timeoutMs === 8000 && call.maxOutputBytes === 5 * 1024 * 1024)).toBe(
      true
    );
    await expect(client.readUidNetworkStats("R58M123ABC", 0)).rejects.toThrow("Invalid Android package uid");
  });

  it("reads Android FPS probe commands through CommandRunner", async () => {
    const runner = new FakeRunner({
      "devices -l": result(readAndroidFixture("adb_devices_one_device.txt")),
      "-s R58M123ABC shell dumpsys gfxinfo com.example.app framestats": result(
        readAndroidFixture("gfxinfo_framestats_sample.txt")
      ),
      "-s R58M123ABC shell dumpsys gfxinfo com.example.app reset": result(""),
      "-s R58M123ABC shell dumpsys SurfaceFlinger --timestats -clear -enable": result(""),
      "-s R58M123ABC shell dumpsys SurfaceFlinger --timestats -clear": result(""),
      "-s R58M123ABC shell dumpsys SurfaceFlinger --timestats -dump": result(
        readAndroidFixture("surfaceflinger_timestats_sample.txt")
      ),
      "-s R58M123ABC shell dumpsys SurfaceFlinger --timestats -disable": result(""),
      "-s R58M123ABC shell dumpsys SurfaceFlinger --list": result(
        readAndroidFixture("surfaceflinger_layers_sample.txt")
      ),
      "-s R58M123ABC shell dumpsys display": result(readAndroidFixture("display_refresh_rate_sample.txt"))
    });
    const client = new AdbClient({ commandRunner: runner });
    await client.listDevices();

    await expect(client.readGfxinfoFramestats("R58M123ABC", "com.example.app")).resolves.toContain(
      "FrameCompleted"
    );
    await expect(client.clearGfxinfoFramestats("R58M123ABC", "com.example.app")).resolves.toBeUndefined();
    await expect(client.clearSurfaceFlingerTimestats("R58M123ABC")).resolves.toBeUndefined();
    await expect(client.enableSurfaceFlingerTimestats("R58M123ABC")).resolves.toBeUndefined();
    await expect(client.dumpSurfaceFlingerTimestats("R58M123ABC")).resolves.toContain("Average FPS");
    await expect(client.disableSurfaceFlingerTimestats("R58M123ABC")).resolves.toBeUndefined();
    await expect(client.dumpSurfaceFlingerLayers("R58M123ABC")).resolves.toContain("com.example.app");
    await expect(client.readDisplayRefreshRate("R58M123ABC")).resolves.toContain("fps=120.0");

    expect(runner.calls.some((call) => call.timeoutMs === 8000 && call.maxOutputBytes === 10 * 1024 * 1024)).toBe(
      true
    );
    expect(runner.calls.some((call) => call.timeoutMs === 5000 && call.maxOutputBytes === 3 * 1024 * 1024)).toBe(
      true
    );
    await expect(client.readGfxinfoFramestats("R58M123ABC", "com.example;bad")).rejects.toThrow(
      "Invalid Android package name"
    );
  });

  it("runs Android lifecycle commands through CommandRunner", async () => {
    const runner = new FakeRunner({
      "devices -l": result(readAndroidFixture("adb_devices_one_device.txt")),
      "-s R58M123ABC shell dumpsys package com.example.app": result(
        readAndroidFixture("dumpsys_package_activities_sample.txt")
      ),
      "-s R58M123ABC shell am start -W -n com.example.app/.MainActivity": result(
        readAndroidFixture("am_start_success_sample.txt")
      ),
      "-s R58M123ABC shell monkey -p com.example.app 1": result(
        readAndroidFixture("monkey_launch_success_sample.txt")
      ),
      "-s R58M123ABC shell am force-stop com.example.app": result(""),
      "-s R58M123ABC shell pidof com.example.app": result(readAndroidFixture("pidof_sample.txt"))
    });
    const client = new AdbClient({ commandRunner: runner });
    await client.listDevices();

    await expect(client.getLauncherActivities("R58M123ABC", "com.example.app")).resolves.toEqual([
      expect.objectContaining({ componentName: "com.example.app/.MainActivity" })
    ]);
    await expect(client.startActivity("R58M123ABC", "com.example.app/.MainActivity")).resolves.toMatchObject({
      ok: true,
      waitTimeMs: 789
    });
    await expect(client.launchPackageWithMonkey("R58M123ABC", "com.example.app")).resolves.toMatchObject({
      ok: true,
      eventsSent: 1
    });
    await expect(client.forceStopPackage("R58M123ABC", "com.example.app")).resolves.toMatchObject({
      ok: true,
      method: "am_force_stop"
    });
    await expect(
      client.waitForPid("R58M123ABC", "com.example.app", { timeoutMs: 1, pollIntervalMs: 1 })
    ).resolves.toMatchObject({ found: true, pid: 12345 });

    expect(runner.calls.some((call) => call.timeoutMs === 15000 && call.maxOutputBytes === 256 * 1024)).toBe(
      true
    );
    await expect(client.startActivity("R58M123ABC", "com.example.app/Bad;Activity")).rejects.toThrow(
      "Invalid Android component name"
    );
  });

  it("detects foreground app from resumed activity before activity top fallback", async () => {
    const runner = new FakeRunner({
      "devices -l": result(readAndroidFixture("adb_devices_one_device.txt")),
      "-s R58M123ABC shell dumpsys activity activities": result(
        [
          "topResumedActivity=ActivityRecord{323e553 u0 com.tencent.nrc/com.epicgames.ue4.GameActivity t3011}",
          "mFocusedApp=ActivityRecord{323e553 u0 com.tencent.nrc/com.epicgames.ue4.GameActivity t3011}"
        ].join("\n")
      ),
      "-s R58M123ABC shell dumpsys activity top": result(
        "ACTIVITY com.nn.accelerator.box/com.nn.libacc.accui.activity.GameAccOverviewActivity c004fc9 pid=9682"
      )
    });
    const client = new AdbClient({ commandRunner: runner });
    await client.listDevices();

    await expect(client.getForegroundApp("R58M123ABC")).resolves.toMatchObject({
      packageName: "com.tencent.nrc",
      source: "top_resumed_activity"
    });
    expect(runner.calls.map((call) => call.args?.join(" "))).toContain(
      "-s R58M123ABC shell dumpsys activity activities"
    );
    expect(runner.calls.map((call) => call.args?.join(" "))).not.toContain(
      "-s R58M123ABC shell dumpsys activity top"
    );
  });
});
