import { describe, expect, it } from "vitest";
import type { CommandResult, CommandRunnerOptions } from "@lumatrace/core";
import {
  parseCpuThermalZoneDiscoveryJson,
  parseNvidiaSmiTelemetryCsv,
  parseWindowsSystemTelemetryJson,
  WindowsHardwareTelemetryProvider,
  WindowsHardwareTelemetrySampler
} from "../src";
import { readPcFixture } from "./fixture";
import { FakeHardwareTelemetryProvider } from "./fakeHardwareTelemetryProvider";

describe("Windows hardware telemetry parsers", () => {
  it("accepts only a live ACPI zone whose AML scope contains a processor list", () => {
    expect(
      parseCpuThermalZoneDiscoveryJson(
        readPcFixture("windows_acpi_cpu_thermal_zone_discovery.json")
      )
    ).toEqual(["TZ00"]);
    expect(
      parseCpuThermalZoneDiscoveryJson(
        '{"ThermalZoneInstances":["\\\\_TZ.TZ00"],"FirmwareTables":[{"Data":"W4UNVFowMF9UTVBYWFhY"}]}'
      )
    ).toEqual([]);
    expect(
      parseCpuThermalZoneDiscoveryJson(
        '{"ThermalZoneInstances":["\\\\_TZ.TZ00"],"FirmwareTables":[{"Data":"W4UNVFowMFhQU0xQUjAw"}]}'
      )
    ).toEqual([]);
  });

  it("parses NVIDIA utilization, board power, and temperature fixture rows", () => {
    const rows = parseNvidiaSmiTelemetryCsv(readPcFixture("nvidia_smi_telemetry_sample.csv"));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      index: 0,
      name: "NVIDIA GeForce RTX 2070 SUPER",
      utilizationPercent: 36,
      powerW: 53.48,
      temperatureC: 47
    });
  });

  it("parses process GPU plus explicit CPU/GPU temperature fixture values with strict PID matching", () => {
    const fixture = readPcFixture("windows_gpu_thermal_sample.json");
    const parsed = parseWindowsSystemTelemetryJson(fixture, 4321);
    expect(parsed?.gpu).toMatchObject({
      available: true,
      pid: 4321,
      engineCount: 3,
      activeEngineCount: 2,
      utilizationPercent: 47
    });
    expect(parsed?.cpuTemperature).toMatchObject({
      available: true,
      sensorCount: 2,
      temperatureC: 62.85,
      source: "librehardwaremonitor:wmi"
    });
    expect(parsed?.gpuTemperature).toMatchObject({
      available: true,
      sensorCount: 1,
      temperatureC: 55,
      source: "librehardwaremonitor:wmi"
    });
    expect(parseWindowsSystemTelemetryJson(fixture, 9999)).toBeNull();
  });

  it("rejects malformed, out-of-range, and unsupported sensor values", () => {
    expect(parseNvidiaSmiTelemetryCsv("0, GPU, 120, N/A, 999")).toEqual([
      { index: 0, name: "GPU" }
    ]);
    expect(parseWindowsSystemTelemetryJson("{bad", 4321)).toBeNull();
  });
});

describe("WindowsHardwareTelemetryProvider", () => {
  it("runs both public telemetry sources through CommandRunner policies", async () => {
    const calls: CommandRunnerOptions[] = [];
    const results = [
      readPcFixture("windows_acpi_cpu_thermal_zone_discovery.json"),
      readPcFixture("windows_gpu_thermal_sample.json"),
      readPcFixture("nvidia_smi_telemetry_sample.csv")
    ];
    const runner = {
      async run(options: CommandRunnerOptions): Promise<CommandResult> {
        calls.push(options);
        const stdout = results.shift() ?? "";
        return {
          command: options.command,
          args: [...(options.args ?? [])],
          stdout,
          stderr: "",
          exitCode: 0,
          signal: null,
          startTimeMs: 1,
          durationMs: 1,
          timedOut: false,
          aborted: false,
          maxOutputBytes: options.maxOutputBytes ?? 1024,
          stdoutTruncated: false,
          stderrTruncated: false,
          sanitizedCommand: options.command,
          sanitizedStdout: stdout,
          sanitizedStderr: ""
        };
      }
    };
    const provider = new WindowsHardwareTelemetryProvider({
      commandRunner: runner as never,
      platform: "win32"
    });

    const sample = await provider.sample(4321);

    expect(calls.map((call) => call.command)).toEqual([
      "powershell.exe",
      "powershell.exe",
      "nvidia-smi.exe"
    ]);
    expect(calls.every((call) => call.timeoutMs > 0 && (call.maxOutputBytes ?? 0) > 0)).toBe(true);
    expect(calls[0]?.args?.join(" ")).toContain("Win32_PerfFormattedData_Counters_ThermalZoneInformation");
    expect(calls[1]?.args?.join(" ")).toContain("Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine");
    expect(calls[1]?.args?.join(" ")).toContain("TZ00");
    expect(sample.windows.gpu.utilizationPercent).toBe(47);
    expect(sample.nvidiaGpus[0]?.powerW).toBe(53.48);
  });
});

describe("WindowsHardwareTelemetrySampler", () => {
  it("emits process GPU plus device-level power and temperature without changing their scope", async () => {
    const provider = new FakeHardwareTelemetryProvider([
      {
        windows: {
          gpu: {
            available: true,
            pid: 4321,
            engineCount: 4,
            activeEngineCount: 1,
            utilizationPercent: 38
          },
          cpuTemperature: {
            available: true,
            sensorCount: 2,
            temperatureC: 58,
            source: "librehardwaremonitor:wmi",
            provider: "LibreHardwareMonitor"
          },
          gpuTemperature: {
            available: false,
            sensorCount: 0
          }
        },
        nvidiaGpus: [
          {
            index: 0,
            name: "NVIDIA Test GPU",
            utilizationPercent: 44,
            powerW: 85.5,
            temperatureC: 61
          }
        ],
        warnings: []
      }
    ]);
    let sequence = 0;
    const sampler = new WindowsHardwareTelemetrySampler({
      provider,
      sessionId: "session",
      deviceId: "device",
      targetId: "target",
      pid: 4321,
      processName: "Game.exe",
      nowMs: () => 1000,
      nextSequence: () => ++sequence
    });

    const events = await sampler.sample();

    expect(events.map((event) => event.metricName)).toEqual([
      "gpu_utilization",
      "power_w",
      "cpu_temperature_c",
      "gpu_temperature_c"
    ]);
    expect(events[0]).toMatchObject({
      value: 38,
      source: "windows:cim-gpu-engine",
      precision: "estimated",
      tags: { scope: "process", aggregation: "max_engine" }
    });
    expect(events[1]).toMatchObject({
      value: 85.5,
      source: "nvidia-smi:device",
      precision: "device_level",
      tags: { scope: "device", aggregation: "sum_gpu_board_power" }
    });
    expect(events[2]).toMatchObject({
      value: 58,
      source: "librehardwaremonitor:wmi",
      precision: "device_level",
      tags: { scope: "device", aggregation: "max_cpu_temperature_sensor" }
    });
    expect(events[3]).toMatchObject({
      value: 61,
      source: "nvidia-smi:device",
      precision: "device_level",
      tags: { scope: "device", aggregation: "max_gpu_temperature" }
    });
  });

  it("honors metric selection and throttles the hardware commands", async () => {
    const provider = new FakeHardwareTelemetryProvider([
      {
        windows: {
          gpu: {
            available: true,
            pid: 4321,
            engineCount: 1,
            activeEngineCount: 0,
            utilizationPercent: 0
          },
          cpuTemperature: { available: false, sensorCount: 0 },
          gpuTemperature: { available: false, sensorCount: 0 }
        },
        nvidiaGpus: [{ index: 0, name: "GPU", powerW: 10, temperatureC: 40 }],
        warnings: []
      }
    ]);
    let now = 1000;
    const sampler = new WindowsHardwareTelemetrySampler({
      provider,
      sessionId: "session",
      deviceId: "device",
      targetId: "target",
      pid: 4321,
      processName: "Game.exe",
      requestedMetrics: ["power_w"],
      nowMs: () => now
    });

    expect((await sampler.sample()).map((event) => event.metricName)).toEqual(["power_w"]);
    now = 1500;
    expect(await sampler.sample()).toEqual([]);
    expect(provider.sampleCalls).toBe(1);
  });

  it("marks the built-in ACPI processor-zone reading as low-confidence device telemetry", async () => {
    const provider = new FakeHardwareTelemetryProvider([
      {
        windows: {
          gpu: { available: false, pid: 4321, engineCount: 0, activeEngineCount: 0 },
          cpuTemperature: {
            available: true,
            sensorCount: 1,
            temperatureC: 42.85,
            source: "windows:acpi-standard-processor-thermal-zone",
            provider: "Win32_PerfFormattedData_Counters_ThermalZoneInformation",
            sensorNames: ["\\_TZ.TZ00"]
          },
          gpuTemperature: { available: false, sensorCount: 0 }
        },
        nvidiaGpus: [],
        warnings: []
      }
    ]);
    const sampler = new WindowsHardwareTelemetrySampler({
      provider,
      sessionId: "session",
      deviceId: "device",
      targetId: "target",
      pid: 4321,
      processName: "Game.exe",
      requestedMetrics: ["cpu_temperature_c"],
      nowMs: () => 1000
    });

    expect(await sampler.sample()).toEqual([
      expect.objectContaining({
        metricName: "cpu_temperature_c",
        value: 42.85,
        source: "windows:acpi-standard-processor-thermal-zone",
        precision: "device_level",
        confidence: "low",
        tags: expect.objectContaining({
          scope: "device",
          sensorKind: "firmware_thermal_zone",
          processorAssociation: "firmware_processor_list",
          thermalZones: "\\_TZ.TZ00"
        })
      })
    ]);
  });

  it("reports each unavailable provider warning only once", async () => {
    const warning = {
      code: "POWER_TELEMETRY_FAILED" as const,
      category: "power" as const,
      message: "Power unavailable."
    };
    const unavailable = {
      windows: {
        gpu: { available: false, pid: 4321, engineCount: 0, activeEngineCount: 0 },
        cpuTemperature: { available: false, sensorCount: 0 },
        gpuTemperature: { available: false, sensorCount: 0 }
      },
      nvidiaGpus: [],
      warnings: [warning]
    };
    const provider = new FakeHardwareTelemetryProvider([unavailable, unavailable]);
    const warnings: string[] = [];
    let now = 1000;
    const sampler = new WindowsHardwareTelemetrySampler({
      provider,
      sessionId: "session",
      deviceId: "device",
      targetId: "target",
      pid: 4321,
      processName: "Game.exe",
      nowMs: () => now,
      onWarning: (item) => warnings.push(item.code)
    });
    await sampler.sample();
    now = 2000;
    await sampler.sample();
    expect(warnings).toEqual(["POWER_TELEMETRY_FAILED"]);
  });
});
