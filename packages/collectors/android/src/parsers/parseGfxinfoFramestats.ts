import { countJankFrames, countSevereJankFrames } from "@lumatrace/core";

export interface GfxFrameRecord {
  intendedVsyncNs?: number;
  frameCompletedNs?: number;
  frameDurationMs?: number;
  isValid: boolean;
  flags?: number;
  rawLine: string;
}

export interface GfxinfoFramestatsResult {
  packageName?: string;
  frames: GfxFrameRecord[];
  frameTimeMsSamples: number[];
  avgFps?: number;
  droppedFrameCount?: number;
  jankCount?: number;
  severeJankCount?: number;
  firstFrameTimestampNs?: number;
  lastFrameTimestampNs?: number;
  warnings: string[];
}

const REQUIRED_COLUMNS = ["IntendedVsync", "FrameCompleted"] as const;

function parseInteger(value: string | undefined): number | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function columnIndex(headers: readonly string[], name: string): number {
  return headers.findIndex((header) => header.trim() === name);
}

function average(values: readonly number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function parseGfxinfoFramestats(
  output: string,
  options: { packageName?: string; refreshRate?: number } = {}
): GfxinfoFramestatsResult {
  const warnings: string[] = [];
  const frames: GfxFrameRecord[] = [];
  const frameTimeMsSamples: number[] = [];
  let headers: string[] | null = null;
  let inProfileData = false;
  let profileMarkerCount = 0;

  if (output.trim().length === 0) {
    return { frames, frameTimeMsSamples, warnings: ["gfxinfo framestats output was empty."] };
  }
  if (/no process found/i.test(output)) {
    return {
      frames,
      frameTimeMsSamples,
      warnings: ["gfxinfo reported that no process was found for the target package."]
    };
  }

  for (const line of output.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    if (/^---PROFILEDATA---$/u.test(trimmed)) {
      profileMarkerCount += 1;
      if (profileMarkerCount > 1) {
        break;
      }
      inProfileData = true;
      continue;
    }
    if (!inProfileData && !trimmed.startsWith("Flags,")) {
      continue;
    }
    if (trimmed.startsWith("Flags,")) {
      headers = trimmed.split(",").map((header) => header.trim());
      for (const required of REQUIRED_COLUMNS) {
        if (columnIndex(headers, required) < 0) {
          warnings.push(`Missing gfxinfo framestats column: ${required}`);
        }
      }
      continue;
    }
    if (headers === null || !/^\d/u.test(trimmed)) {
      if (inProfileData && /,/u.test(trimmed)) {
        warnings.push(`Malformed gfxinfo framestats line: ${trimmed}`);
      }
      continue;
    }

    const values = trimmed.split(",");
    const intendedVsyncNs = parseInteger(values[columnIndex(headers, "IntendedVsync")]);
    const frameCompletedNs = parseInteger(values[columnIndex(headers, "FrameCompleted")]);
    const flags = parseInteger(values[columnIndex(headers, "Flags")]);
    frames.push({
      ...(intendedVsyncNs === undefined ? {} : { intendedVsyncNs }),
      ...(frameCompletedNs === undefined ? {} : { frameCompletedNs }),
      ...(flags === undefined ? {} : { flags }),
      isValid: intendedVsyncNs !== undefined && frameCompletedNs !== undefined,
      rawLine: trimmed
    });
  }

  const completedFrames = frames
    .filter((frame) => frame.frameCompletedNs !== undefined)
    .sort((left, right) => (left.frameCompletedNs ?? 0) - (right.frameCompletedNs ?? 0));
  for (let index = 1; index < completedFrames.length; index += 1) {
    const previous = completedFrames[index - 1]?.frameCompletedNs;
    const current = completedFrames[index]?.frameCompletedNs;
    if (previous === undefined || current === undefined) {
      continue;
    }
    const durationMs = (current - previous) / 1_000_000;
    if (Number.isFinite(durationMs) && durationMs > 0 && durationMs < 10_000) {
      frameTimeMsSamples.push(durationMs);
      completedFrames[index]!.frameDurationMs = durationMs;
    } else {
      warnings.push("Ignored invalid gfxinfo frame completion delta.");
    }
  }

  if (frameTimeMsSamples.length === 0 && completedFrames.length === 1) {
    const frame = completedFrames[0]!;
    if (frame.frameCompletedNs !== undefined && frame.intendedVsyncNs !== undefined) {
      const fallbackDurationMs = (frame.frameCompletedNs - frame.intendedVsyncNs) / 1_000_000;
      if (Number.isFinite(fallbackDurationMs) && fallbackDurationMs > 0) {
        frameTimeMsSamples.push(fallbackDurationMs);
        frame.frameDurationMs = fallbackDurationMs;
        warnings.push("Used FrameCompleted - IntendedVsync for a single-frame low-confidence duration.");
      }
    }
  }

  const result: GfxinfoFramestatsResult = {
    ...(options.packageName === undefined ? {} : { packageName: options.packageName }),
    frames,
    frameTimeMsSamples,
    droppedFrameCount: frames.filter((frame) => frame.flags !== undefined && frame.flags !== 0).length,
    jankCount: countJankFrames(frameTimeMsSamples, options.refreshRate ?? 60),
    severeJankCount: countSevereJankFrames(frameTimeMsSamples, options.refreshRate ?? 60),
    warnings
  };
  const firstFrameTimestampNs = completedFrames[0]?.frameCompletedNs;
  const lastFrameTimestampNs = completedFrames.at(-1)?.frameCompletedNs;
  if (firstFrameTimestampNs !== undefined) {
    result.firstFrameTimestampNs = firstFrameTimestampNs;
  }
  if (lastFrameTimestampNs !== undefined) {
    result.lastFrameTimestampNs = lastFrameTimestampNs;
  }
  const avgFrameTimeMs = average(frameTimeMsSamples);
  if (avgFrameTimeMs !== undefined && avgFrameTimeMs > 0) {
    result.avgFps = 1000 / avgFrameTimeMs;
  }
  if (frames.length === 0) {
    result.warnings.push("No gfxinfo framestats frames were parsed.");
  }
  return result;
}
