import type {
  AdbVersionInfo,
  AndroidAdbClientLike,
  AndroidAdbDevice,
  AndroidLogcatCommandResult,
  AndroidLogcatDumpOptions,
  AndroidPackage
} from "../src/types";
import type {
  AndroidForceStopResult,
  AndroidLauncherActivity,
  AndroidMonkeyLaunchResult,
  AndroidPidWaitResult,
  AndroidStartActivityResult
} from "../src/lifecycle/AndroidLifecycleTypes";
import { parseAdbDevices } from "../src/adb/parseAdbDevices";
import { parseBattery, type AndroidBatteryInfo } from "../src/parsers/parseBattery";
import { parseAmStart } from "../src/parsers/parseAmStart";
import { parseDumpsysPackageActivities } from "../src/parsers/parseDumpsysPackageActivities";
import { parseGetProp } from "../src/parsers/parseGetProp";
import { parseMeminfo, type AndroidMeminfo } from "../src/parsers/parseMeminfo";
import { parseMonkeyLaunch } from "../src/parsers/parseMonkeyLaunch";
import { parseNetstatsDetailForUid, type NetstatsUidSnapshot } from "../src/parsers/parseNetstatsDetail";
import { parsePackageList } from "../src/parsers/parsePackageList";
import { parseProcPidStat, type ProcPidStatSnapshot } from "../src/parsers/parseProcPidStat";
import { parseProcNetDev, type ProcNetDevSnapshot } from "../src/parsers/parseProcNetDev";
import { parseProcStat, type ProcStatSnapshot } from "../src/parsers/parseProcStat";
import { parseProcStatus, type ProcStatusMemory } from "../src/parsers/parseProcStatus";
import { createPidWaitResult } from "../src/parsers/parsePidWait";
import type { AndroidForegroundAppResult } from "../src/parsers/parseForegroundApp";
import { readAndroidFixture } from "./fixture";

export class FakeSamplingAdbClient implements AndroidAdbClientLike {
  devices: AndroidAdbDevice[] = parseAdbDevices(readAndroidFixture("adb_devices_one_device.txt"));
  packages: AndroidPackage[] = parsePackageList(readAndroidFixture("pm_list_packages_sample.txt")).packages;
  props: Record<string, string> = parseGetProp(readAndroidFixture("getprop_pixel_sample.txt"));
  pidQueue: Array<number | null> = [];
  pid: number | null = 12345;
  procStatQueue: Array<ProcStatSnapshot | null> = [
    parseProcStat(readAndroidFixture("proc_stat_sample_1.txt")),
    parseProcStat(readAndroidFixture("proc_stat_sample_2.txt"))
  ];
  procPidStatQueue: Array<ProcPidStatSnapshot | null> = [
    parseProcPidStat(readAndroidFixture("proc_pid_stat_sample_1.txt")),
    parseProcPidStat(readAndroidFixture("proc_pid_stat_sample_2.txt"))
  ];
  meminfo: AndroidMeminfo = parseMeminfo(readAndroidFixture("dumpsys_meminfo_package_sample.txt"));
  procStatus: ProcStatusMemory | null = parseProcStatus(readAndroidFixture("proc_pid_status_sample.txt"));
  battery: AndroidBatteryInfo = parseBattery(readAndroidFixture("dumpsys_battery_sample.txt"));
  packageUid: number | null = 10123;
  procNetDevQueue: ProcNetDevSnapshot[] = [
    parseProcNetDev(readAndroidFixture("proc_net_dev_sample_1.txt")),
    parseProcNetDev(readAndroidFixture("proc_net_dev_sample_2.txt"))
  ];
  netstatsDetailQueue: string[] = [
    readAndroidFixture("dumpsys_netstats_detail_uid_sample.txt"),
    readAndroidFixture("dumpsys_netstats_detail_uid_sample_2.txt")
  ];
  gfxinfoFramestats = readAndroidFixture("gfxinfo_framestats_sample.txt");
  surfaceFlingerTimestats = readAndroidFixture("surfaceflinger_timestats_sample.txt");
  surfaceFlingerLayers = readAndroidFixture("surfaceflinger_layers_sample.txt");
  surfaceFlingerLatency = readAndroidFixture("surfaceflinger_latency_sample.txt");
  displayRefreshRate = readAndroidFixture("display_refresh_rate_sample.txt");
  launcherActivities: AndroidLauncherActivity[] = parseDumpsysPackageActivities(
    readAndroidFixture("dumpsys_package_activities_sample.txt"),
    { packageName: "com.example.app" }
  ).activities;
  amStartOutput = readAndroidFixture("am_start_success_sample.txt");
  monkeyLaunchOutput = readAndroidFixture("monkey_launch_success_sample.txt");
  startActivityCalls: string[] = [];
  monkeyLaunchCalls: string[] = [];
  forceStopCalls: string[] = [];
  dumpLogcatCalls: Array<{ serial: string; options: AndroidLogcatDumpOptions }> = [];
  logcatOutput = readAndroidFixture("logcat_threadtime_sample.txt");
  waitForPidCalls = 0;
  clearGfxinfoFramestatsCalls = 0;
  enableSurfaceFlingerTimestatsCalls = 0;
  clearSurfaceFlingerTimestatsCalls = 0;
  disableSurfaceFlingerTimestatsCalls = 0;
  failMethods = new Set<string>();
  foregroundApp: AndroidForegroundAppResult = {
    packageName: "com.example.app",
    activityName: ".MainActivity",
    componentName: "com.example.app/.MainActivity",
    source: "activity_top",
    confidence: "high",
    warnings: []
  };

  async getVersion(): Promise<AdbVersionInfo> {
    return { version: "1.0.41" };
  }

  async listDevices(): Promise<AndroidAdbDevice[]> {
    return this.devices;
  }

  async getProps(): Promise<Record<string, string>> {
    return this.props;
  }

  async listPackages(): Promise<AndroidPackage[]> {
    return this.packages;
  }

  async getPid(): Promise<number | null> {
    if (this.failMethods.has("getPid")) {
      throw new Error("pid read failed");
    }
    const next = this.pidQueue.shift();
    return next === undefined ? this.pid : next;
  }

  async getPackageUid(): Promise<number | null> {
    if (this.failMethods.has("getPackageUid")) {
      throw new Error("uid failed");
    }
    return this.packageUid;
  }

  async readProcStat(): Promise<ProcStatSnapshot | null> {
    if (this.failMethods.has("readProcStat")) {
      throw new Error("proc stat failed");
    }
    const next = this.procStatQueue.shift();
    return next === undefined ? parseProcStat(readAndroidFixture("proc_stat_sample_2.txt")) : next;
  }

  async readProcPidStat(): Promise<ProcPidStatSnapshot | null> {
    if (this.failMethods.has("readProcPidStat")) {
      throw new Error("proc pid stat failed");
    }
    const next = this.procPidStatQueue.shift();
    return next === undefined ? parseProcPidStat(readAndroidFixture("proc_pid_stat_sample_2.txt")) : next;
  }

  async readProcStatus(): Promise<ProcStatusMemory | null> {
    if (this.failMethods.has("readProcStatus")) {
      throw new Error("proc status failed");
    }
    return this.procStatus;
  }

  async readMeminfo(): Promise<AndroidMeminfo> {
    if (this.failMethods.has("readMeminfo")) {
      throw new Error("meminfo failed");
    }
    return this.meminfo;
  }

  async readBattery(): Promise<AndroidBatteryInfo> {
    if (this.failMethods.has("readBattery")) {
      throw new Error("battery failed");
    }
    return this.battery;
  }

  async readProcNetDev(): Promise<ProcNetDevSnapshot> {
    if (this.failMethods.has("readProcNetDev")) {
      throw new Error("proc net dev failed");
    }
    return this.procNetDevQueue.shift() ?? parseProcNetDev(readAndroidFixture("proc_net_dev_sample_2.txt"));
  }

  async readNetstatsDetail(): Promise<string> {
    if (this.failMethods.has("readNetstatsDetail")) {
      throw new Error("netstats failed");
    }
    return this.netstatsDetailQueue.shift() ?? readAndroidFixture("dumpsys_netstats_detail_uid_sample_2.txt");
  }

  async readUidNetworkStats(serial: string, uid: number): Promise<NetstatsUidSnapshot | null> {
    void serial;
    if (this.failMethods.has("readUidNetworkStats")) {
      throw new Error("uid netstats failed");
    }
    return parseNetstatsDetailForUid(await this.readNetstatsDetail(), uid);
  }

  async readGfxinfoFramestats(): Promise<string> {
    if (this.failMethods.has("readGfxinfoFramestats")) {
      throw new Error("gfxinfo failed");
    }
    return this.gfxinfoFramestats;
  }

  async clearGfxinfoFramestats(): Promise<void> {
    this.clearGfxinfoFramestatsCalls += 1;
    if (this.failMethods.has("clearGfxinfoFramestats")) {
      throw new Error("gfxinfo reset failed");
    }
  }

  async enableSurfaceFlingerTimestats(): Promise<void> {
    this.enableSurfaceFlingerTimestatsCalls += 1;
    if (this.failMethods.has("enableSurfaceFlingerTimestats")) {
      throw new Error("sf enable failed");
    }
  }

  async clearSurfaceFlingerTimestats(): Promise<void> {
    this.clearSurfaceFlingerTimestatsCalls += 1;
    if (this.failMethods.has("clearSurfaceFlingerTimestats")) {
      throw new Error("sf clear failed");
    }
  }

  async dumpSurfaceFlingerTimestats(): Promise<string> {
    if (this.failMethods.has("dumpSurfaceFlingerTimestats")) {
      throw new Error("sf dump failed");
    }
    return this.surfaceFlingerTimestats;
  }

  async disableSurfaceFlingerTimestats(): Promise<void> {
    this.disableSurfaceFlingerTimestatsCalls += 1;
    if (this.failMethods.has("disableSurfaceFlingerTimestats")) {
      throw new Error("sf disable failed");
    }
  }

  async dumpSurfaceFlingerLayers(): Promise<string> {
    if (this.failMethods.has("dumpSurfaceFlingerLayers")) {
      throw new Error("sf layers failed");
    }
    return this.surfaceFlingerLayers;
  }

  async readSurfaceFlingerLatency(): Promise<string> {
    if (this.failMethods.has("readSurfaceFlingerLatency")) {
      throw new Error("sf latency failed");
    }
    return this.surfaceFlingerLatency;
  }

  async readDisplayRefreshRate(): Promise<string> {
    if (this.failMethods.has("readDisplayRefreshRate")) {
      throw new Error("display failed");
    }
    return this.displayRefreshRate;
  }

  async getForegroundApp(): Promise<AndroidForegroundAppResult> {
    if (this.failMethods.has("getForegroundApp")) {
      throw new Error("foreground app failed");
    }
    return this.foregroundApp;
  }

  async getLauncherActivities(): Promise<AndroidLauncherActivity[]> {
    if (this.failMethods.has("getLauncherActivities")) {
      throw new Error("launcher discovery failed");
    }
    return this.launcherActivities;
  }

  async startActivity(_serial: string, componentName: string): Promise<AndroidStartActivityResult> {
    this.startActivityCalls.push(componentName);
    if (this.failMethods.has("startActivity")) {
      throw new Error("am start failed");
    }
    return parseAmStart(this.amStartOutput);
  }

  async launchPackageWithMonkey(_serial: string, packageName: string): Promise<AndroidMonkeyLaunchResult> {
    this.monkeyLaunchCalls.push(packageName);
    if (this.failMethods.has("launchPackageWithMonkey")) {
      throw new Error("monkey failed");
    }
    return parseMonkeyLaunch(this.monkeyLaunchOutput);
  }

  async forceStopPackage(_serial: string, packageName: string): Promise<AndroidForceStopResult> {
    this.forceStopCalls.push(packageName);
    if (this.failMethods.has("forceStopPackage")) {
      throw new Error("force-stop failed");
    }
    this.pid = null;
    return {
      ok: true,
      method: "am_force_stop",
      durationMs: 1,
      warnings: [],
      rawOutput: ""
    };
  }

  async waitForPid(): Promise<AndroidPidWaitResult> {
    this.waitForPidCalls += 1;
    if (this.failMethods.has("waitForPid")) {
      throw new Error("wait pid failed");
    }
    const next = this.pidQueue.shift();
    const pid = next === undefined ? this.pid : next;
    return createPidWaitResult({
      pid,
      attempts: 1,
      durationMs: 1,
      ...(pid === null ? { reason: "Timed out waiting for target PID." } : {})
    });
  }

  async dumpLogcat(
    serial: string,
    options: AndroidLogcatDumpOptions
  ): Promise<AndroidLogcatCommandResult> {
    this.dumpLogcatCalls.push({ serial, options });
    if (this.failMethods.has("dumpLogcat")) {
      return {
        stdout: "",
        stderr: "logcat failed",
        sanitizedStdout: "",
        sanitizedStderr: "logcat failed",
        exitCode: 1,
        timedOut: false,
        aborted: false,
        stdoutTruncated: false
      };
    }
    return {
      stdout: this.logcatOutput,
      stderr: "",
      sanitizedStdout: this.logcatOutput,
      sanitizedStderr: "",
      exitCode: 0,
      timedOut: false,
      aborted: false,
      stdoutTruncated: false
    };
  }
}
