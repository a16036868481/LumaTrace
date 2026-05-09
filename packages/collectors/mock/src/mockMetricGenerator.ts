import {
  METRIC_NAMES,
  METRIC_UNITS,
  type MetricConfidence,
  type MetricEvent,
  type MetricPrecision,
  type Tags
} from "@lumatrace/core";
import {
  DEFAULT_MOCK_PROFILE_NAME,
  getMockProfile,
  type MockMetricProfile,
  type MockProfileName
} from "./mockProfiles";

export type MockJankType = "normal" | "jank" | "severe_jank";

export interface CreateMockMetricEventsOptions {
  sessionId: string;
  deviceId: string;
  targetId: string;
  sampleIndex: number;
  profile?: MockMetricProfile;
  profileName?: MockProfileName | string;
  seed?: string | number;
  timestampMs?: number;
  monotonicMs?: number;
  sequenceStart?: number;
}

export interface MockMetricGeneratorOptions
  extends Omit<CreateMockMetricEventsOptions, "sampleIndex" | "sequenceStart"> {
  sampleIntervalMs?: number;
  startSampleIndex?: number;
  startSequence?: number;
  maxTicks?: number;
  immediate?: boolean;
  shouldContinue?: () => boolean;
  shouldEmit?: () => boolean;
}

const DEFAULT_SEED = "lumatrace-mock";
const MOCK_SOURCE = "mock";
const MOCK_PARSER_VERSION = "mock-generator-v1";

function hashString(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function seededRandom(seed: string | number | undefined, parts: readonly string[]): number {
  const seedText = String(seed ?? DEFAULT_SEED);
  const hash = hashString([seedText, ...parts].join("|"));
  return hash / 0xffffffff;
}

function jitteredValue(
  baseline: number,
  jitter: number,
  seed: string | number | undefined,
  sampleIndex: number,
  salt: string
): number {
  const random = seededRandom(seed, [String(sampleIndex), salt]);
  return baseline + (random * 2 - 1) * jitter;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, fractionDigits: number): number {
  return Number(value.toFixed(fractionDigits));
}

function getJankType(profile: MockMetricProfile, sampleIndex: number): MockJankType {
  if (
    profile.fps.severeDropEveryTicks > 0 &&
    sampleIndex > 0 &&
    sampleIndex % profile.fps.severeDropEveryTicks === 0
  ) {
    return "severe_jank";
  }

  if (
    profile.fps.periodicDropEveryTicks > 0 &&
    sampleIndex > 0 &&
    sampleIndex % profile.fps.periodicDropEveryTicks === 0
  ) {
    return "jank";
  }

  return "normal";
}

function generateFps(profile: MockMetricProfile, sampleIndex: number, seed?: string | number): number {
  const jankType = getJankType(profile, sampleIndex);

  if (jankType === "severe_jank") {
    const random = seededRandom(seed, [profile.name, String(sampleIndex), "severe-fps"]);
    const fps =
      profile.fps.severeDropFpsMin +
      random * (profile.fps.severeDropFpsMax - profile.fps.severeDropFpsMin);
    return round(fps, 2);
  }

  if (jankType === "jank") {
    return round(
      jitteredValue(profile.fps.periodicDropFps, 2, seed, sampleIndex, `${profile.name}:jank-fps`),
      2
    );
  }

  const fps = jitteredValue(
    profile.fps.baselineFps,
    profile.fps.jitterFps,
    seed,
    sampleIndex,
    `${profile.name}:fps`
  );
  return round(clamp(fps, 1, profile.refreshRate), 2);
}

function generateCpu(profile: MockMetricProfile, sampleIndex: number, seed?: string | number): number {
  if (
    profile.cpu.spikeEveryTicks > 0 &&
    sampleIndex > 0 &&
    sampleIndex % profile.cpu.spikeEveryTicks === 0
  ) {
    const random = seededRandom(seed, [profile.name, String(sampleIndex), "cpu-spike"]);
    return round(
      profile.cpu.spikeMinPercent +
        random * (profile.cpu.spikeMaxPercent - profile.cpu.spikeMinPercent),
      2
    );
  }

  const cpu = jitteredValue(
    profile.cpu.baselinePercent,
    profile.cpu.jitterPercent,
    seed,
    sampleIndex,
    `${profile.name}:cpu`
  );
  return round(clamp(cpu, 0, 100), 2);
}

function generateMemory(profile: MockMetricProfile, sampleIndex: number, seed?: string | number): number {
  const gcCount =
    profile.memory.gcEveryTicks > 0 ? Math.floor(sampleIndex / profile.memory.gcEveryTicks) : 0;
  const jitter = jitteredValue(0, profile.memory.jitterMb, seed, sampleIndex, `${profile.name}:memory`);
  const memory =
    profile.memory.baselineMb +
    sampleIndex * profile.memory.growthMbPerTick -
    gcCount * profile.memory.gcDropMb +
    jitter;

  return round(clamp(memory, profile.memory.baselineMb * 0.85, profile.memory.maxMb), 2);
}

function createTags(
  profile: MockMetricProfile,
  extra: Tags = {},
  jankType: MockJankType = "normal"
): Tags {
  return {
    refreshRate: profile.refreshRate,
    profileName: profile.name,
    jankType,
    ...extra
  };
}

function createMetricEvent(
  options: {
    sessionId: string;
    timestampMs: number;
    monotonicMs: number;
    sequence: number;
    deviceId: string;
    targetId: string;
    metricName: string;
    value: number;
    unit: string;
    tags: Tags;
  },
  precision: MetricPrecision = "estimated",
  confidence: MetricConfidence = "high"
): MetricEvent {
  return {
    sessionId: options.sessionId,
    timestampMs: options.timestampMs,
    monotonicMs: options.monotonicMs,
    sequence: options.sequence,
    deviceId: options.deviceId,
    targetId: options.targetId,
    metricName: options.metricName,
    value: options.value,
    unit: options.unit,
    source: MOCK_SOURCE,
    precision,
    confidence,
    parserVersion: MOCK_PARSER_VERSION,
    tags: options.tags
  };
}

export function createMockMetricEvents(options: CreateMockMetricEventsOptions): MetricEvent[] {
  const profile = options.profile ?? getMockProfile(options.profileName ?? DEFAULT_MOCK_PROFILE_NAME);
  const timestampMs =
    options.timestampMs ?? options.sampleIndex * profile.sampleIntervalMs;
  const monotonicMs = options.monotonicMs ?? options.sampleIndex * profile.sampleIntervalMs;
  const sequenceStart = options.sequenceStart ?? options.sampleIndex * 4;
  const jankType = getJankType(profile, options.sampleIndex);
  const fps = generateFps(profile, options.sampleIndex, options.seed);
  const frameTimeMs = round(1000 / fps, 2);
  const normalizedCpuPercent = generateCpu(profile, options.sampleIndex, options.seed);
  const rawCpuPercent = round(normalizedCpuPercent * profile.cpu.coreCount, 2);
  const memoryMb = generateMemory(profile, options.sampleIndex, options.seed);

  return [
    createMetricEvent({
      sessionId: options.sessionId,
      timestampMs,
      monotonicMs,
      sequence: sequenceStart,
      deviceId: options.deviceId,
      targetId: options.targetId,
      metricName: METRIC_NAMES.FPS,
      value: fps,
      unit: METRIC_UNITS.FPS,
      tags: createTags(profile, {}, jankType)
    }),
    createMetricEvent({
      sessionId: options.sessionId,
      timestampMs,
      monotonicMs,
      sequence: sequenceStart + 1,
      deviceId: options.deviceId,
      targetId: options.targetId,
      metricName: METRIC_NAMES.FRAME_TIME_MS,
      value: frameTimeMs,
      unit: METRIC_UNITS.MILLISECONDS,
      tags: createTags(profile, {}, jankType)
    }),
    createMetricEvent({
      sessionId: options.sessionId,
      timestampMs,
      monotonicMs,
      sequence: sequenceStart + 2,
      deviceId: options.deviceId,
      targetId: options.targetId,
      metricName: METRIC_NAMES.CPU_PERCENT,
      value: normalizedCpuPercent,
      unit: METRIC_UNITS.PERCENT,
      tags: createTags(profile, {
        rawPercent: rawCpuPercent,
        normalizedPercent: normalizedCpuPercent,
        coreCount: profile.cpu.coreCount
      })
    }),
    createMetricEvent({
      sessionId: options.sessionId,
      timestampMs,
      monotonicMs,
      sequence: sequenceStart + 3,
      deviceId: options.deviceId,
      targetId: options.targetId,
      metricName: METRIC_NAMES.MEMORY_MB,
      value: memoryMb,
      unit: METRIC_UNITS.MEGABYTES,
      tags: createTags(profile)
    })
  ];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function* createMockMetricGenerator(
  options: MockMetricGeneratorOptions
): AsyncIterable<MetricEvent> {
  const profile = options.profile ?? getMockProfile(options.profileName ?? DEFAULT_MOCK_PROFILE_NAME);
  const sampleIntervalMs = options.sampleIntervalMs ?? profile.sampleIntervalMs;
  const startTimestampMs = options.timestampMs ?? Date.now();
  const startMonotonicMs = options.monotonicMs ?? 0;
  const shouldContinue = options.shouldContinue ?? (() => true);
  const shouldEmit = options.shouldEmit ?? (() => true);
  let sampleIndex = options.startSampleIndex ?? 0;
  let sequence = options.startSequence ?? 0;
  let emittedTicks = 0;

  while (shouldContinue()) {
    if (options.maxTicks !== undefined && emittedTicks >= options.maxTicks) {
      return;
    }

    if (!shouldEmit()) {
      await delay(Math.max(1, sampleIntervalMs));
      continue;
    }

    const eventOptions: CreateMockMetricEventsOptions = {
      sessionId: options.sessionId,
      deviceId: options.deviceId,
      targetId: options.targetId,
      sampleIndex,
      profile,
      timestampMs: startTimestampMs + sampleIndex * sampleIntervalMs,
      monotonicMs: startMonotonicMs + sampleIndex * sampleIntervalMs,
      sequenceStart: sequence
    };

    if (options.seed !== undefined) {
      eventOptions.seed = options.seed;
    }

    const events = createMockMetricEvents(eventOptions);

    for (const event of events) {
      if (!shouldContinue()) {
        return;
      }
      yield event;
      sequence = (event.sequence ?? sequence) + 1;
    }

    sampleIndex += 1;
    emittedTicks += 1;

    if (options.immediate !== true) {
      await delay(sampleIntervalMs);
    }
  }
}
