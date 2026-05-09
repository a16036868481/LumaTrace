import {
  expectedFrameTimeMs,
  METRIC_NAMES,
  METRIC_UNITS,
  type MetricAvailability,
  type MetricEvent
} from "@lumatrace/core";
import type { AndroidAdbClientLike } from "../types";
import { createAndroidMetricEvent, type AndroidSamplerContext } from "../sampling/AndroidSamplerTypes";
import { parseGfxinfoFramestats } from "../parsers/parseGfxinfoFramestats";
import { parseSurfaceFlingerLayers } from "../parsers/parseSurfaceFlingerLayers";
import { parseSurfaceFlingerTimestats, type SurfaceFlingerLayerStats } from "../parsers/parseSurfaceFlingerTimestats";
import { parseSurfaceFlingerLatency, type SurfaceFlingerLatencyResult } from "../parsers/parseSurfaceFlingerLatency";
import { parseDisplayRefreshRate } from "../parsers/parseDisplayRefreshRate";
import { analyzeFrameStats, type AndroidFpsAnalysis } from "./FrameStatsAnalyzer";
import { matchLayer, type LayerMatchResult } from "./LayerMatcher";
import { buildAndroidFpsAvailability } from "./fpsAvailability";

export interface AndroidFpsProbeResult {
  status: "available" | "unavailable" | "ambiguous" | "failed";
  sourceUsed?: "gfxinfo" | "surfaceflinger_timestats" | "surfaceflinger_latency" | "both";
  matchedLayerName?: string;
  layerMatchConfidence?: "high" | "medium" | "low" | "none";
  analysis?: AndroidFpsAnalysis;
  metricEvents?: MetricEvent[];
  warnings: string[];
  availability: MetricAvailability[];
}

export interface AndroidFpsProbeLike {
  prepare(): Promise<AndroidFpsProbeResult>;
  finish(): Promise<AndroidFpsProbeResult>;
}

export interface AndroidFpsProbeOptions {
  adbClient: AndroidAdbClientLike;
  context: AndroidSamplerContext;
  targetName?: string;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resultWith(
  status: AndroidFpsProbeResult["status"],
  warnings: string[],
  extra: Partial<Omit<AndroidFpsProbeResult, "status" | "warnings" | "availability">> = {}
): AndroidFpsProbeResult {
  return {
    status,
    warnings,
    availability: buildAndroidFpsAvailability(),
    ...extra
  };
}

function chooseSurfaceLayer(
  match: LayerMatchResult,
  layers: readonly SurfaceFlingerLayerStats[]
): SurfaceFlingerLayerStats | null {
  if (match.matchedLayerName === undefined) {
    return null;
  }
  return layers.find((layer) => layer.layerName === match.matchedLayerName) ?? null;
}

export class AndroidFpsProbe implements AndroidFpsProbeLike {
  private readonly adbClient: AndroidAdbClientLike;
  private readonly context: AndroidSamplerContext;
  private readonly targetName: string | undefined;
  private lastLatencyActualPresentTimeNs: number | undefined;
  private lastLatencyLayerName: string | undefined;

  constructor(options: AndroidFpsProbeOptions) {
    this.adbClient = options.adbClient;
    this.context = options.context;
    this.targetName = options.targetName;
  }

  async prepare(): Promise<AndroidFpsProbeResult> {
    const warnings: string[] = [];
    try {
      await this.adbClient.clearGfxinfoFramestats(this.context.serial, this.context.packageName);
    } catch (error) {
      warnings.push(`gfxinfo framestats reset failed: ${messageOf(error)}`);
    }
    try {
      await this.adbClient.clearSurfaceFlingerTimestats(this.context.serial);
      await this.adbClient.enableSurfaceFlingerTimestats(this.context.serial);
    } catch (error) {
      warnings.push(`SurfaceFlinger timestats prepare failed: ${messageOf(error)}`);
    }
    await this.prepareSurfaceFlingerLatencyBaseline(warnings);
    return resultWith(warnings.length === 0 ? "available" : "failed", warnings);
  }

  async finish(): Promise<AndroidFpsProbeResult> {
    const warnings: string[] = [];
    let refreshRate = 60;
    try {
      const display = parseDisplayRefreshRate(await this.adbClient.readDisplayRefreshRate(this.context.serial));
      warnings.push(...display.warnings);
      if (display.activeRefreshRate !== undefined) {
        refreshRate = display.activeRefreshRate;
      } else {
        warnings.push("Using 60 Hz fallback because display refresh rate was unavailable.");
      }
    } catch (error) {
      warnings.push(`Display refresh rate read failed: ${messageOf(error)}`);
      warnings.push("Using 60 Hz fallback because display refresh rate was unavailable.");
    }

    const gfx = await this.tryReadGfxinfo(refreshRate, warnings);
    const sf = await this.tryReadSurfaceFlinger(warnings);
    try {
      await this.adbClient.disableSurfaceFlingerTimestats(this.context.serial);
    } catch (error) {
      warnings.push(`SurfaceFlinger timestats disable failed: ${messageOf(error)}`);
    }

    if (gfx.frameTimeMsSamples.length > 0) {
      const analysis = analyzeFrameStats({
        frameTimeMsSamples: gfx.frameTimeMsSamples,
        refreshRate,
        source: "adb:dumpsys gfxinfo framestats",
        precision: "estimated"
      });
      return resultWith("available", [...warnings, ...gfx.warnings, ...analysis.warnings], {
        sourceUsed: sf.match.confidence === "none" ? "gfxinfo" : "both",
        ...(sf.match.matchedLayerName === undefined ? {} : { matchedLayerName: sf.match.matchedLayerName }),
        layerMatchConfidence: sf.match.confidence,
        analysis,
        metricEvents: this.buildMetricEvents(analysis, {
          source: "adb:dumpsys gfxinfo framestats",
          sourceCommand: "dumpsys gfxinfo <package> framestats",
          refreshRate,
          layerMatch: sf.match,
          parserVersion: "android-gfxinfo-framestats-v1",
          reason: "gfxinfo framestats produced real frame completion deltas."
        })
      });
    }

    if (sf.match.confidence === "none") {
      return resultWith("unavailable", [...warnings, ...sf.warnings, sf.match.reason], {
        layerMatchConfidence: "none"
      });
    }
    if (sf.match.ambiguity) {
      return resultWith("ambiguous", [...warnings, ...sf.warnings, sf.match.reason], {
        ...(sf.match.matchedLayerName === undefined ? {} : { matchedLayerName: sf.match.matchedLayerName }),
        layerMatchConfidence: sf.match.confidence
      });
    }

    if (sf.match.matchedLayerName !== undefined) {
      const latency = await this.tryReadSurfaceFlingerLatency(sf.match.matchedLayerName, warnings);
      const latencySamples = this.consumeNewLatencySamples(sf.match.matchedLayerName, latency);
      if (latencySamples.length > 0) {
        const analysis = analyzeFrameStats({
          frameTimeMsSamples: latencySamples,
          refreshRate,
          source: "adb:dumpsys SurfaceFlinger --latency",
          precision: "estimated"
        });
        return resultWith("available", [
          ...warnings,
          ...sf.warnings,
          ...latency.warnings,
          ...analysis.warnings
        ], {
          sourceUsed: "surfaceflinger_latency",
          matchedLayerName: sf.match.matchedLayerName,
          layerMatchConfidence: sf.match.confidence,
          analysis,
          metricEvents: this.buildMetricEvents(analysis, {
            source: "adb:dumpsys SurfaceFlinger --latency",
            sourceCommand: "dumpsys SurfaceFlinger --latency <matched-layer>",
            refreshRate,
            layerMatch: sf.match,
            parserVersion: "android-surfaceflinger-latency-v1",
            reason: "SurfaceFlinger latency produced target-matched per-frame presentation deltas."
          })
        });
      }
      if (latency.frames.length > 0) {
        warnings.push("SurfaceFlinger latency baseline was updated; waiting for newer frames.");
      }
    }

    const matchedLayer = chooseSurfaceLayer(sf.match, sf.timestats.layers);
    if (matchedLayer === null) {
      return resultWith("unavailable", [...warnings, ...sf.warnings, "Matched layer was absent from timestats dump."], {
        ...(sf.match.matchedLayerName === undefined ? {} : { matchedLayerName: sf.match.matchedLayerName }),
        layerMatchConfidence: sf.match.confidence
      });
    }

    const analysis = analyzeFrameStats({
      ...(matchedLayer.averageFps === undefined ? {} : { avgFps: matchedLayer.averageFps }),
      ...(matchedLayer.presentToPresentHistogram === undefined
        ? {}
        : { histogram: matchedLayer.presentToPresentHistogram }),
      refreshRate,
      source: "adb:dumpsys SurfaceFlinger --timestats",
      precision: "estimated"
    });
    return resultWith(analysis.avgFps === undefined ? "unavailable" : "available", [
      ...warnings,
      ...sf.warnings,
      ...matchedLayer.warnings,
      ...analysis.warnings
    ], {
      sourceUsed: "surfaceflinger_timestats",
      ...(sf.match.matchedLayerName === undefined ? {} : { matchedLayerName: sf.match.matchedLayerName }),
      layerMatchConfidence: sf.match.confidence,
      analysis,
      metricEvents:
        analysis.avgFps === undefined
          ? []
          : this.buildMetricEvents(analysis, {
              source: "adb:dumpsys SurfaceFlinger --timestats",
              sourceCommand: "dumpsys SurfaceFlinger --timestats -dump",
              refreshRate,
              layerMatch: sf.match,
              parserVersion: "android-surfaceflinger-timestats-v1",
              reason: analysis.approximate
                ? "SurfaceFlinger timestats produced approximate histogram or average FPS."
                : "SurfaceFlinger timestats produced frame timing samples."
            })
    });
  }

  private async tryReadGfxinfo(refreshRate: number, warnings: string[]) {
    try {
      return parseGfxinfoFramestats(
        await this.adbClient.readGfxinfoFramestats(this.context.serial, this.context.packageName),
        {
          packageName: this.context.packageName,
          refreshRate
        }
      );
    } catch (error) {
      warnings.push(`gfxinfo framestats dump failed: ${messageOf(error)}`);
      return parseGfxinfoFramestats("");
    }
  }

  private async tryReadSurfaceFlinger(warnings: string[]) {
    try {
      const timestats = parseSurfaceFlingerTimestats(
        await this.adbClient.dumpSurfaceFlingerTimestats(this.context.serial)
      );
      const layers = parseSurfaceFlingerLayers(await this.adbClient.dumpSurfaceFlingerLayers(this.context.serial));
      const layerMatch = matchLayer({
        packageName: this.context.packageName,
        ...(this.targetName === undefined ? {} : { targetName: this.targetName }),
        layers: layers.layers,
        timestatsLayers: timestats.layers
      });
      return {
        timestats,
        layers,
        match: layerMatch,
        warnings: [...timestats.warnings, ...layers.warnings]
      };
    } catch (error) {
      warnings.push(`SurfaceFlinger timestats dump failed: ${messageOf(error)}`);
      return {
        timestats: { layers: [], warnings: [] },
        layers: { layers: [], warnings: [] },
        match: matchLayer({ packageName: this.context.packageName, layers: [], timestatsLayers: [] }),
        warnings: []
      };
    }
  }

  private async prepareSurfaceFlingerLatencyBaseline(warnings: string[]): Promise<void> {
    try {
      const layers = parseSurfaceFlingerLayers(await this.adbClient.dumpSurfaceFlingerLayers(this.context.serial));
      warnings.push(...layers.warnings);
      const layerMatch = matchLayer({
        packageName: this.context.packageName,
        ...(this.targetName === undefined ? {} : { targetName: this.targetName }),
        layers: layers.layers,
        timestatsLayers: []
      });
      if (layerMatch.matchedLayerName === undefined || layerMatch.ambiguity) {
        return;
      }
      const latency = parseSurfaceFlingerLatency(
        await this.adbClient.readSurfaceFlingerLatency(this.context.serial, layerMatch.matchedLayerName)
      );
      warnings.push(...latency.warnings);
      this.updateLatencyBaseline(layerMatch.matchedLayerName, latency);
    } catch (error) {
      warnings.push(`SurfaceFlinger latency baseline failed: ${messageOf(error)}`);
    }
  }

  private async tryReadSurfaceFlingerLatency(
    layerName: string,
    warnings: string[]
  ): Promise<SurfaceFlingerLatencyResult> {
    try {
      return parseSurfaceFlingerLatency(
        await this.adbClient.readSurfaceFlingerLatency(this.context.serial, layerName)
      );
    } catch (error) {
      warnings.push(`SurfaceFlinger latency dump failed: ${messageOf(error)}`);
      return parseSurfaceFlingerLatency("");
    }
  }

  private updateLatencyBaseline(layerName: string, latency: SurfaceFlingerLatencyResult): void {
    const latest = latency.frames.reduce<number | undefined>(
      (current, frame) =>
        current === undefined || frame.actualPresentTimeNs > current ? frame.actualPresentTimeNs : current,
      undefined
    );
    if (latest !== undefined) {
      this.lastLatencyLayerName = layerName;
      this.lastLatencyActualPresentTimeNs = latest;
    }
  }

  private consumeNewLatencySamples(layerName: string, latency: SurfaceFlingerLatencyResult): number[] {
    const previous =
      this.lastLatencyLayerName === layerName ? this.lastLatencyActualPresentTimeNs : undefined;
    const samples =
      previous === undefined
        ? latency.frameTimeMsSamples
        : latency.frames
            .filter((frame) => frame.actualPresentTimeNs > previous)
            .map((frame) => frame.frameTimeMs)
            .filter((value): value is number => value !== undefined);
    this.updateLatencyBaseline(layerName, latency);
    return samples;
  }

  private buildMetricEvents(
    analysis: AndroidFpsAnalysis,
    options: {
      source: string;
      sourceCommand: string;
      refreshRate: number;
      layerMatch: LayerMatchResult;
      parserVersion: string;
      reason: string;
    }
  ): MetricEvent[] {
    const tags = {
      sampler: "fps",
      sourceCommand: options.sourceCommand,
      targetLayerName: this.context.packageName,
      matchedLayerName: options.layerMatch.matchedLayerName ?? "",
      layerMatchConfidence: options.layerMatch.confidence,
      ambiguity: options.layerMatch.ambiguity,
      refreshRate: options.refreshRate,
      expectedFrameTimeMs: expectedFrameTimeMs(options.refreshRate),
      reason: options.reason,
      experimental: true
    };
    const events: MetricEvent[] = [];
    if (analysis.avgFps !== undefined) {
      events.push(
        createAndroidMetricEvent({
          context: this.context,
          metricName: METRIC_NAMES.FPS,
          value: analysis.avgFps,
          unit: METRIC_UNITS.FPS,
          source: options.source,
          precision: "estimated",
          confidence: options.layerMatch.confidence === "high" ? "medium" : "low",
          parserVersion: options.parserVersion,
          tags
        })
      );
    }
    for (const frameTimeMs of analysis.frameTimeMsSamples ?? []) {
      if (!Number.isFinite(frameTimeMs) || frameTimeMs <= 0) {
        continue;
      }
      events.push(
        createAndroidMetricEvent({
          context: this.context,
          metricName: METRIC_NAMES.FRAME_TIME_MS,
          value: frameTimeMs,
          unit: METRIC_UNITS.MILLISECONDS,
          source: options.source,
          precision: "estimated",
          confidence: analysis.approximate ? "low" : "medium",
          parserVersion: options.parserVersion,
          tags: {
            ...tags,
            approximate: analysis.approximate
          }
        })
      );
    }
    return events;
  }
}
