export interface SurfaceFlingerLatencyFrame {
  desiredPresentTimeNs: number;
  actualPresentTimeNs: number;
  frameReadyTimeNs: number;
  frameTimeMs?: number;
}

export interface SurfaceFlingerLatencyResult {
  refreshPeriodNs?: number;
  frames: SurfaceFlingerLatencyFrame[];
  frameTimeMsSamples: number[];
  warnings: string[];
}

function parseInteger(value: string | undefined): number | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseSurfaceFlingerLatency(output: string): SurfaceFlingerLatencyResult {
  const warnings: string[] = [];
  const frames: SurfaceFlingerLatencyFrame[] = [];
  const lines = output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return {
      frames,
      frameTimeMsSamples: [],
      warnings: ["SurfaceFlinger latency output was empty."]
    };
  }

  const refreshPeriodNs = parseInteger(lines[0]);
  if (refreshPeriodNs === undefined || refreshPeriodNs <= 0) {
    warnings.push("SurfaceFlinger latency refresh period was unavailable.");
  }

  let previousActualPresentTimeNs: number | undefined;
  for (const line of lines.slice(1)) {
    const parts = line.split(/\s+/u);
    if (parts.length < 3) {
      warnings.push(`Malformed SurfaceFlinger latency row: ${line}`);
      continue;
    }

    const desiredPresentTimeNs = parseInteger(parts[0]);
    const actualPresentTimeNs = parseInteger(parts[1]);
    const frameReadyTimeNs = parseInteger(parts[2]);
    if (
      desiredPresentTimeNs === undefined ||
      actualPresentTimeNs === undefined ||
      frameReadyTimeNs === undefined
    ) {
      warnings.push(`Malformed SurfaceFlinger latency row: ${line}`);
      continue;
    }
    if (desiredPresentTimeNs <= 0 || actualPresentTimeNs <= 0 || frameReadyTimeNs <= 0) {
      continue;
    }

    const frame: SurfaceFlingerLatencyFrame = {
      desiredPresentTimeNs,
      actualPresentTimeNs,
      frameReadyTimeNs
    };
    if (previousActualPresentTimeNs !== undefined) {
      const frameTimeMs = (actualPresentTimeNs - previousActualPresentTimeNs) / 1_000_000;
      if (Number.isFinite(frameTimeMs) && frameTimeMs > 0 && frameTimeMs < 1000) {
        frame.frameTimeMs = frameTimeMs;
      } else {
        warnings.push("SurfaceFlinger latency row produced an invalid frame delta.");
      }
    }
    previousActualPresentTimeNs = actualPresentTimeNs;
    frames.push(frame);
  }

  const frameTimeMsSamples = frames
    .map((frame) => frame.frameTimeMs)
    .filter((value): value is number => value !== undefined);
  if (frames.length > 1 && frameTimeMsSamples.length === 0) {
    warnings.push("SurfaceFlinger latency output had frames but no usable frame-time deltas.");
  }
  if (frames.length === 0) {
    warnings.push("No usable SurfaceFlinger latency frames were parsed.");
  }

  return {
    ...(refreshPeriodNs === undefined || refreshPeriodNs <= 0 ? {} : { refreshPeriodNs }),
    frames,
    frameTimeMsSamples,
    warnings
  };
}
