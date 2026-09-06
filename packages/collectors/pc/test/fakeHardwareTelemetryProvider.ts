import type {
  WindowsHardwareTelemetryProbe,
  WindowsHardwareTelemetryProviderLike,
  WindowsHardwareTelemetrySample
} from "../src";

export function emptyHardwareSample(pid: number): WindowsHardwareTelemetrySample {
  return {
    windows: {
      gpu: {
        available: false,
        pid,
        engineCount: 0,
        activeEngineCount: 0
      },
      cpuTemperature: {
        available: false,
        sensorCount: 0
      },
      gpuTemperature: {
        available: false,
        sensorCount: 0
      }
    },
    nvidiaGpus: [],
    warnings: []
  };
}

export class FakeHardwareTelemetryProvider implements WindowsHardwareTelemetryProviderLike {
  readonly samples: WindowsHardwareTelemetrySample[];
  readonly probeResult: WindowsHardwareTelemetryProbe;
  sampleCalls = 0;

  constructor(
    samples: WindowsHardwareTelemetrySample[] = [],
    probeResult: WindowsHardwareTelemetryProbe = {
      processGpuAvailable: false,
      powerAvailable: false,
      cpuTemperatureAvailable: false,
      gpuTemperatureAvailable: false
    }
  ) {
    this.samples = [...samples];
    this.probeResult = probeResult;
  }

  async sample(pid: number): Promise<WindowsHardwareTelemetrySample> {
    this.sampleCalls += 1;
    return this.samples.shift() ?? emptyHardwareSample(pid);
  }

  async probe(): Promise<WindowsHardwareTelemetryProbe> {
    return { ...this.probeResult };
  }
}
