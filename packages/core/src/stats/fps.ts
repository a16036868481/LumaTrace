import { average, maxValue, minValue, percentile } from "./percentiles";

export interface FpsSummaryInput {
  frameTimesMs?: readonly number[];
  fpsSamples?: readonly number[];
  refreshRate?: number;
}

export interface FpsSummary {
  sampleCount: number;
  refreshRate: number;
  avgFps?: number;
  minFps?: number;
  maxFps?: number;
  onePercentLowFps?: number;
  zeroPointOnePercentLowFps?: number;
  p50FrameTimeMs?: number;
  p90FrameTimeMs?: number;
  p95FrameTimeMs?: number;
  p99FrameTimeMs?: number;
  jankCount: number;
  severeJankCount: number;
}

export function frameTimeToFps(frameTimeMs: number): number | undefined {
  if (!Number.isFinite(frameTimeMs) || frameTimeMs <= 0) {
    return undefined;
  }

  return 1000 / frameTimeMs;
}

export function fpsToFrameTimeMs(fps: number): number | undefined {
  if (!Number.isFinite(fps) || fps <= 0) {
    return undefined;
  }

  return 1000 / fps;
}

export function expectedFrameTimeMs(refreshRate: number): number {
  if (!Number.isFinite(refreshRate) || refreshRate <= 0) {
    return 1000 / 60;
  }

  return 1000 / refreshRate;
}

export function countJankFrames(frameTimesMs: readonly number[], refreshRate = 60): number {
  const expected = expectedFrameTimeMs(refreshRate);
  return frameTimesMs.filter((frameTime) => Number.isFinite(frameTime) && frameTime > 2 * expected)
    .length;
}

export function countSevereJankFrames(frameTimesMs: readonly number[], refreshRate = 60): number {
  const expected = expectedFrameTimeMs(refreshRate);
  return frameTimesMs.filter((frameTime) => Number.isFinite(frameTime) && frameTime > 3 * expected)
    .length;
}

export function onePercentLow(values: readonly number[], percentage: number): number | undefined {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) {
    return undefined;
  }

  const sampleCount = Math.max(1, Math.ceil(finite.length * percentage));
  const worstSamples = [...finite].sort((left, right) => left - right).slice(0, sampleCount);
  return average(worstSamples);
}

export function summarizeFps(input: FpsSummaryInput): FpsSummary {
  const refreshRate = input.refreshRate ?? 60;
  const frameTimesMs = (input.frameTimesMs ?? [])
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => value);
  const fpsSamples =
    input.fpsSamples
      ?.filter((value) => Number.isFinite(value) && value > 0)
      .map((value) => value) ??
    frameTimesMs
      .map((frameTime) => frameTimeToFps(frameTime))
      .filter((value): value is number => value !== undefined);
  const effectiveFrameTimes =
    frameTimesMs.length > 0
      ? frameTimesMs
      : fpsSamples
          .map((fps) => fpsToFrameTimeMs(fps))
          .filter((value): value is number => value !== undefined);

  const summary: FpsSummary = {
    sampleCount: Math.max(fpsSamples.length, effectiveFrameTimes.length),
    refreshRate,
    jankCount: countJankFrames(effectiveFrameTimes, refreshRate),
    severeJankCount: countSevereJankFrames(effectiveFrameTimes, refreshRate)
  };

  const avgFps = average(fpsSamples);
  const minFps = minValue(fpsSamples);
  const maxFps = maxValue(fpsSamples);
  const oneLow = onePercentLow(fpsSamples, 0.01);
  const pointOneLow = onePercentLow(fpsSamples, 0.001);
  const p50 = percentile(effectiveFrameTimes, 50);
  const p90 = percentile(effectiveFrameTimes, 90);
  const p95 = percentile(effectiveFrameTimes, 95);
  const p99 = percentile(effectiveFrameTimes, 99);

  if (avgFps !== undefined) {
    summary.avgFps = avgFps;
  }
  if (minFps !== undefined) {
    summary.minFps = minFps;
  }
  if (maxFps !== undefined) {
    summary.maxFps = maxFps;
  }
  if (oneLow !== undefined) {
    summary.onePercentLowFps = oneLow;
  }
  if (pointOneLow !== undefined) {
    summary.zeroPointOnePercentLowFps = pointOneLow;
  }
  if (p50 !== undefined) {
    summary.p50FrameTimeMs = p50;
  }
  if (p90 !== undefined) {
    summary.p90FrameTimeMs = p90;
  }
  if (p95 !== undefined) {
    summary.p95FrameTimeMs = p95;
  }
  if (p99 !== undefined) {
    summary.p99FrameTimeMs = p99;
  }

  return summary;
}
