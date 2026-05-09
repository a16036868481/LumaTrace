export type MockProfileName = "stable_60fps" | "janky_game" | "memory_growth";

export interface MockFpsBehavior {
  baselineFps: number;
  jitterFps: number;
  periodicDropEveryTicks: number;
  periodicDropFps: number;
  severeDropEveryTicks: number;
  severeDropFpsMin: number;
  severeDropFpsMax: number;
}

export interface MockCpuBehavior {
  baselinePercent: number;
  jitterPercent: number;
  spikeEveryTicks: number;
  spikeMinPercent: number;
  spikeMaxPercent: number;
  coreCount: number;
}

export interface MockMemoryBehavior {
  baselineMb: number;
  growthMbPerTick: number;
  jitterMb: number;
  gcEveryTicks: number;
  gcDropMb: number;
  maxMb: number;
}

export interface MockMetricProfile {
  name: MockProfileName;
  refreshRate: number;
  sampleIntervalMs: number;
  fps: MockFpsBehavior;
  cpu: MockCpuBehavior;
  memory: MockMemoryBehavior;
}

export const DEFAULT_MOCK_PROFILE_NAME: MockProfileName = "janky_game";

export const mockProfiles: Record<MockProfileName, MockMetricProfile> = {
  stable_60fps: {
    name: "stable_60fps",
    refreshRate: 60,
    sampleIntervalMs: 1000,
    fps: {
      baselineFps: 58,
      jitterFps: 2,
      periodicDropEveryTicks: 20,
      periodicDropFps: 45,
      severeDropEveryTicks: 0,
      severeDropFpsMin: 0,
      severeDropFpsMax: 0
    },
    cpu: {
      baselinePercent: 28,
      jitterPercent: 8,
      spikeEveryTicks: 18,
      spikeMinPercent: 70,
      spikeMaxPercent: 82,
      coreCount: 8
    },
    memory: {
      baselineMb: 500,
      growthMbPerTick: 0.25,
      jitterMb: 4,
      gcEveryTicks: 25,
      gcDropMb: 18,
      maxMb: 720
    }
  },
  janky_game: {
    name: "janky_game",
    refreshRate: 60,
    sampleIntervalMs: 1000,
    fps: {
      baselineFps: 57,
      jitterFps: 3,
      periodicDropEveryTicks: 7,
      periodicDropFps: 26,
      severeDropEveryTicks: 17,
      severeDropFpsMin: 15,
      severeDropFpsMax: 20
    },
    cpu: {
      baselinePercent: 42,
      jitterPercent: 13,
      spikeEveryTicks: 6,
      spikeMinPercent: 78,
      spikeMaxPercent: 95,
      coreCount: 8
    },
    memory: {
      baselineMb: 540,
      growthMbPerTick: 0.7,
      jitterMb: 6,
      gcEveryTicks: 16,
      gcDropMb: 26,
      maxMb: 960
    }
  },
  memory_growth: {
    name: "memory_growth",
    refreshRate: 60,
    sampleIntervalMs: 1000,
    fps: {
      baselineFps: 56,
      jitterFps: 3,
      periodicDropEveryTicks: 11,
      periodicDropFps: 30,
      severeDropEveryTicks: 41,
      severeDropFpsMin: 18,
      severeDropFpsMax: 24
    },
    cpu: {
      baselinePercent: 35,
      jitterPercent: 10,
      spikeEveryTicks: 12,
      spikeMinPercent: 72,
      spikeMaxPercent: 88,
      coreCount: 8
    },
    memory: {
      baselineMb: 500,
      growthMbPerTick: 3.2,
      jitterMb: 5,
      gcEveryTicks: 15,
      gcDropMb: 12,
      maxMb: 1200
    }
  }
};

export function isMockProfileName(value: string): value is MockProfileName {
  return Object.prototype.hasOwnProperty.call(mockProfiles, value);
}

export function getMockProfile(profileName?: string): MockMetricProfile {
  if (profileName !== undefined && isMockProfileName(profileName)) {
    return mockProfiles[profileName];
  }

  return mockProfiles[DEFAULT_MOCK_PROFILE_NAME];
}
