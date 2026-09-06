import { METRIC_NAMES, METRIC_UNITS, type MetricEvent, type Tags } from "@lumatrace/core";
import type {
  NvidiaGpuTelemetry,
  WindowsHardwareTelemetryProviderLike,
  WindowsHardwareTelemetryWarning
} from "./WindowsHardwareTelemetryProvider";

export interface WindowsHardwareTelemetrySamplerOptions {
  provider: WindowsHardwareTelemetryProviderLike;
  sessionId: string;
  deviceId: string;
  targetId: string;
  pid: number;
  processName: string;
  requestedMetrics?: readonly string[];
  minimumIntervalMs?: number;
  nowMs?: () => number;
  nextSequence?: () => number;
  onWarning?: (warning: WindowsHardwareTelemetryWarning) => void;
}

function maximum(values: readonly number[]): number | undefined {
  return values.length === 0 ? undefined : Math.max(...values);
}

function sum(values: readonly number[]): number | undefined {
  return values.length === 0 ? undefined : values.reduce((total, value) => total + value, 0);
}

function gpuTagBase(gpus: readonly NvidiaGpuTelemetry[]): Tags {
  return {
    platform: "windows",
    scope: "device",
    provider: "nvidia-smi",
    gpuCount: gpus.length,
    gpuNames: gpus.map((gpu) => gpu.name).join(" | ").slice(0, 500)
  };
}

export class WindowsHardwareTelemetrySampler {
  private readonly options: Required<
    Pick<WindowsHardwareTelemetrySamplerOptions, "minimumIntervalMs" | "nowMs" | "nextSequence" | "onWarning">
  > &
    Omit<
      WindowsHardwareTelemetrySamplerOptions,
      "minimumIntervalMs" | "nowMs" | "nextSequence" | "onWarning"
    >;
  private readonly requestedMetrics: ReadonlySet<string> | undefined;
  private readonly emittedWarningCodes = new Set<string>();
  private lastSampleAt = Number.NEGATIVE_INFINITY;

  constructor(options: WindowsHardwareTelemetrySamplerOptions) {
    this.options = {
      ...options,
      minimumIntervalMs: Math.max(250, options.minimumIntervalMs ?? 1000),
      nowMs: options.nowMs ?? (() => Date.now()),
      nextSequence: options.nextSequence ?? (() => 0),
      onWarning: options.onWarning ?? (() => undefined)
    };
    this.requestedMetrics =
      options.requestedMetrics === undefined ? undefined : new Set(options.requestedMetrics);
  }

  async sample(): Promise<MetricEvent[]> {
    if (!this.wantsAnyHardwareMetric()) {
      return [];
    }
    const timestampMs = this.options.nowMs();
    if (timestampMs - this.lastSampleAt < this.options.minimumIntervalMs) {
      return [];
    }
    this.lastSampleAt = timestampMs;
    const sample = await this.options.provider.sample(this.options.pid);
    for (const warning of sample.warnings) {
      if (!this.emittedWarningCodes.has(warning.code)) {
        this.emittedWarningCodes.add(warning.code);
        this.options.onWarning(warning);
      }
    }

    const events: MetricEvent[] = [];
    if (this.wants(METRIC_NAMES.GPU_UTILIZATION)) {
      const processGpu = sample.windows.gpu;
      if (processGpu.available && processGpu.utilizationPercent !== undefined) {
        events.push(
          this.event({
            timestampMs,
            metricName: METRIC_NAMES.GPU_UTILIZATION,
            value: processGpu.utilizationPercent,
            unit: METRIC_UNITS.PERCENT,
            source: "windows:cim-gpu-engine",
            precision: "estimated",
            confidence: "medium",
            tags: {
              platform: "windows",
              scope: "process",
              provider: "Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine",
              aggregation: "max_engine",
              pid: this.options.pid,
              processName: this.options.processName,
              engineCount: processGpu.engineCount,
              activeEngineCount: processGpu.activeEngineCount
            }
          })
        );
      } else {
        const values = sample.nvidiaGpus
          .map((gpu) => gpu.utilizationPercent)
          .filter((value): value is number => value !== undefined);
        const value = maximum(values);
        if (value !== undefined) {
          events.push(
            this.event({
              timestampMs,
              metricName: METRIC_NAMES.GPU_UTILIZATION,
              value,
              unit: METRIC_UNITS.PERCENT,
              source: "nvidia-smi:device",
              precision: "device_level",
              confidence: "high",
              tags: {
                ...gpuTagBase(sample.nvidiaGpus),
                aggregation: "max_gpu",
                targetPid: this.options.pid,
                targetProcessName: this.options.processName
              }
            })
          );
        }
      }
    }

    if (this.wants(METRIC_NAMES.POWER_W)) {
      const values = sample.nvidiaGpus
        .map((gpu) => gpu.powerW)
        .filter((value): value is number => value !== undefined);
      const value = sum(values);
      if (value !== undefined) {
        events.push(
          this.event({
            timestampMs,
            metricName: METRIC_NAMES.POWER_W,
            value,
            unit: METRIC_UNITS.WATTS,
            source: "nvidia-smi:device",
            precision: "device_level",
            confidence: "high",
            tags: {
              ...gpuTagBase(sample.nvidiaGpus),
              aggregation: "sum_gpu_board_power",
              targetPid: this.options.pid,
              targetProcessName: this.options.processName
            }
          })
        );
      }
    }

    if (this.wants(METRIC_NAMES.CPU_TEMPERATURE_C)) {
      const cpuTemperature = sample.windows.cpuTemperature;
      if (cpuTemperature.available && cpuTemperature.temperatureC !== undefined) {
        const isAcpi = cpuTemperature.source === "windows:acpi-standard-processor-thermal-zone";
        events.push(
          this.event({
            timestampMs,
            metricName: METRIC_NAMES.CPU_TEMPERATURE_C,
            value: cpuTemperature.temperatureC,
            unit: METRIC_UNITS.CELSIUS,
            source: cpuTemperature.source ?? "windows:cpu-temperature-provider",
            precision: "device_level",
            confidence: isAcpi ? "low" : "medium",
            tags: {
              platform: "windows",
              scope: "device",
              provider: cpuTemperature.provider ?? "supported-cpu-temperature-provider",
              aggregation: "max_cpu_temperature_sensor",
              sensorCount: cpuTemperature.sensorCount,
              ...(isAcpi
                ? {
                    sensorKind: "firmware_thermal_zone",
                    processorAssociation: "firmware_processor_list",
                    thermalZones: (cpuTemperature.sensorNames ?? []).join(" | ").slice(0, 500)
                  }
                : {}),
              targetPid: this.options.pid,
              targetProcessName: this.options.processName
            }
          })
        );
      }
    }

    if (this.wants(METRIC_NAMES.GPU_TEMPERATURE_C)) {
      const values = sample.nvidiaGpus
        .map((gpu) => gpu.temperatureC)
        .filter((value): value is number => value !== undefined);
      const nvidiaTemperature = maximum(values);
      if (nvidiaTemperature !== undefined) {
        events.push(
          this.event({
            timestampMs,
            metricName: METRIC_NAMES.GPU_TEMPERATURE_C,
            value: nvidiaTemperature,
            unit: METRIC_UNITS.CELSIUS,
            source: "nvidia-smi:device",
            precision: "device_level",
            confidence: "high",
            tags: {
              ...gpuTagBase(sample.nvidiaGpus),
              aggregation: "max_gpu_temperature",
              targetPid: this.options.pid,
              targetProcessName: this.options.processName
            }
          })
        );
      } else if (
        sample.windows.gpuTemperature.available &&
        sample.windows.gpuTemperature.temperatureC !== undefined
      ) {
        const gpuTemperature = sample.windows.gpuTemperature;
        const gpuTemperatureValue = sample.windows.gpuTemperature.temperatureC;
        events.push(
          this.event({
            timestampMs,
            metricName: METRIC_NAMES.GPU_TEMPERATURE_C,
            value: gpuTemperatureValue,
            unit: METRIC_UNITS.CELSIUS,
            source: gpuTemperature.source ?? "windows:gpu-temperature-provider",
            precision: "device_level",
            confidence: "medium",
            tags: {
              platform: "windows",
              scope: "device",
              provider: gpuTemperature.provider ?? "supported-gpu-temperature-provider",
              aggregation: "max_gpu_temperature_sensor",
              sensorCount: gpuTemperature.sensorCount,
              targetPid: this.options.pid,
              targetProcessName: this.options.processName
            }
          })
        );
      }
    }
    return events;
  }

  private wants(metricName: string): boolean {
    return this.requestedMetrics === undefined || this.requestedMetrics.has(metricName);
  }

  private wantsAnyHardwareMetric(): boolean {
    return (
      this.wants(METRIC_NAMES.GPU_UTILIZATION) ||
      this.wants(METRIC_NAMES.POWER_W) ||
      this.wants(METRIC_NAMES.CPU_TEMPERATURE_C) ||
      this.wants(METRIC_NAMES.GPU_TEMPERATURE_C)
    );
  }

  private event(
    event: Omit<
      MetricEvent,
      "sessionId" | "deviceId" | "targetId" | "sequence" | "monotonicMs"
    >
  ): MetricEvent {
    return {
      ...event,
      sessionId: this.options.sessionId,
      deviceId: this.options.deviceId,
      targetId: this.options.targetId,
      monotonicMs: event.timestampMs,
      sequence: this.options.nextSequence()
    };
  }
}
