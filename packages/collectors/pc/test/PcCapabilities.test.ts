import { describe, expect, it } from "vitest";
import { getPcCapabilities } from "../src";

describe("PC hardware capabilities", () => {
  it("marks implemented Windows sources available with truthful scope descriptions", () => {
    const capabilities = getPcCapabilities({
      platform: "windows",
      presentMonAvailable: true,
      processGpuAvailable: true,
      processGpuSource: "windows:cim-gpu-engine",
      powerAvailable: true,
      powerSource: "nvidia-smi:device",
      gpuTemperatureAvailable: true,
      gpuTemperatureSource: "nvidia-smi:device"
    });
    const gpu = capabilities.find((item) => item.metricName === "gpu_utilization");
    const power = capabilities.find((item) => item.metricName === "power_w");
    const gpuTemperature = capabilities.find((item) => item.metricName === "gpu_temperature_c");

    expect(gpu).toMatchObject({
      status: "available",
      source: "windows:cim-gpu-engine"
    });
    expect(power).toMatchObject({
      status: "available",
      source: "nvidia-smi:device"
    });
    expect(power?.reason).toContain("device-level");
    expect(gpuTemperature?.reason).toContain("device-level");
  });

  it("does not claim values when supported sensors are absent", () => {
    const capabilities = getPcCapabilities({ platform: "windows" });
    expect(capabilities.find((item) => item.metricName === "gpu_utilization")?.status).toBe(
      "unavailable"
    );
    expect(capabilities.find((item) => item.metricName === "power_w")?.status).toBe(
      "requires_tool"
    );
    expect(capabilities.find((item) => item.metricName === "cpu_temperature_c")).toBeUndefined();
    expect(capabilities.find((item) => item.metricName === "gpu_temperature_c")?.status).toBe(
      "requires_tool"
    );
  });

  it("does not expose CPU temperature even when a provider reports one", () => {
    const capability = getPcCapabilities({
      platform: "windows",
      cpuTemperatureAvailable: true,
      cpuTemperatureSource: "windows:acpi-standard-processor-thermal-zone"
    }).find((item) => item.metricName === "cpu_temperature_c");

    expect(capability).toBeUndefined();
  });
});
