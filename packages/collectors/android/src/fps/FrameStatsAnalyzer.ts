import { summarizeFps, type FpsSummary } from "@lumatrace/core";
import type { SurfaceFlingerHistogramBucket } from "../parsers/parseSurfaceFlingerTimestats";

export interface AndroidFpsAnalysis {
  avgFps?: number;
  minFps?: number;
  maxFps?: number;
  p50FrameTimeMs?: number;
  p90FrameTimeMs?: number;
  p95FrameTimeMs?: number;
  p99FrameTimeMs?: number;
  jankCount?: number;
  severeJankCount?: number;
  frameTimeMsSamples?: number[];
  approximate: boolean;
  warnings: string[];
}

function assignSummary(target: AndroidFpsAnalysis, summary: FpsSummary): void {
  if (summary.avgFps !== undefined) {
    target.avgFps = summary.avgFps;
  }
  if (summary.minFps !== undefined) {
    target.minFps = summary.minFps;
  }
  if (summary.maxFps !== undefined) {
    target.maxFps = summary.maxFps;
  }
  if (summary.p50FrameTimeMs !== undefined) {
    target.p50FrameTimeMs = summary.p50FrameTimeMs;
  }
  if (summary.p90FrameTimeMs !== undefined) {
    target.p90FrameTimeMs = summary.p90FrameTimeMs;
  }
  if (summary.p95FrameTimeMs !== undefined) {
    target.p95FrameTimeMs = summary.p95FrameTimeMs;
  }
  if (summary.p99FrameTimeMs !== undefined) {
    target.p99FrameTimeMs = summary.p99FrameTimeMs;
  }
  target.jankCount = summary.jankCount;
  target.severeJankCount = summary.severeJankCount;
}

function histogramToSamples(histogram: readonly SurfaceFlingerHistogramBucket[]): number[] {
  return histogram.flatMap((bucket) =>
    Array.from({ length: Math.min(bucket.count, 500) }, () => bucket.bucketMs)
  );
}

export function analyzeFrameStats(options: {
  frameTimeMsSamples?: readonly number[];
  avgFps?: number;
  histogram?: readonly SurfaceFlingerHistogramBucket[];
  refreshRate?: number;
  source: string;
  precision: string;
}): AndroidFpsAnalysis {
  const warnings: string[] = [];
  const refreshRate = options.refreshRate ?? 60;
  if (options.refreshRate === undefined) {
    warnings.push("Refresh rate was unavailable; analyzer used 60 Hz fallback.");
  }

  const directSamples = (options.frameTimeMsSamples ?? []).filter(
    (sample) => Number.isFinite(sample) && sample > 0
  );
  if (directSamples.length > 0) {
    const analysis: AndroidFpsAnalysis = {
      frameTimeMsSamples: directSamples,
      approximate: false,
      warnings
    };
    assignSummary(analysis, summarizeFps({ frameTimesMs: directSamples, refreshRate }));
    return analysis;
  }

  const histogramSamples = histogramToSamples(options.histogram ?? []);
  if (histogramSamples.length > 0) {
    const analysis: AndroidFpsAnalysis = {
      frameTimeMsSamples: histogramSamples,
      approximate: true,
      warnings: [...warnings, "SurfaceFlinger histogram was used as an approximate frame-time distribution."]
    };
    assignSummary(analysis, summarizeFps({ frameTimesMs: histogramSamples, refreshRate }));
    if (options.avgFps !== undefined) {
      analysis.avgFps = options.avgFps;
    }
    return analysis;
  }

  const analysis: AndroidFpsAnalysis = {
    approximate: true,
    warnings
  };
  if (options.avgFps !== undefined && Number.isFinite(options.avgFps) && options.avgFps > 0) {
    analysis.avgFps = options.avgFps;
    analysis.warnings.push("Average FPS was available without per-frame timings; frame-time percentiles were not inferred.");
  } else {
    analysis.warnings.push("No usable Android FPS or frame-time samples were available.");
  }
  return analysis;
}
