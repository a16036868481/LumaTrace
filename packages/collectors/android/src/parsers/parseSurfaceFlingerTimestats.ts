export interface SurfaceFlingerHistogramBucket {
  bucketMs: number;
  count: number;
}

export interface SurfaceFlingerLayerStats {
  layerName: string;
  averageFps?: number;
  totalFrames?: number;
  presentToPresentHistogram?: SurfaceFlingerHistogramBucket[];
  frameTimeMsSamplesApprox?: number[];
  rawSection: string;
  warnings: string[];
}

export interface SurfaceFlingerTimestatsResult {
  layers: SurfaceFlingerLayerStats[];
  warnings: string[];
}

function parseNumber(line: string, patterns: readonly RegExp[]): number | undefined {
  for (const pattern of patterns) {
    const match = pattern.exec(line);
    if (match?.[1] !== undefined) {
      const value = Number.parseFloat(match[1]);
      if (Number.isFinite(value)) {
        return value;
      }
    }
  }
  return undefined;
}

function parseHistogramLine(line: string): SurfaceFlingerHistogramBucket | null {
  const match =
    /(?:bucket\s*)?(\d+(?:\.\d+)?)\s*ms\s*(?:=|:|,)\s*(\d+)/iu.exec(line) ??
    /(\d+(?:\.\d+)?)\s*-\s*\d+(?:\.\d+)?\s*ms\s*(?:=|:|,)\s*(\d+)/iu.exec(line);
  if (match?.[1] === undefined || match[2] === undefined) {
    return null;
  }
  const bucketMs = Number.parseFloat(match[1]);
  const count = Number.parseInt(match[2], 10);
  return Number.isFinite(bucketMs) && Number.isFinite(count) ? { bucketMs, count } : null;
}

function buildLayer(sectionLines: readonly string[]): SurfaceFlingerLayerStats | null {
  const rawSection = sectionLines.join("\n");
  const first = sectionLines[0]?.trim();
  if (first === undefined) {
    return null;
  }
  const nameMatch =
    /^(?:Layer(?:\s+name)?|layerName)\s*[:=]\s*(.+)$/iu.exec(first) ??
    /^(.+):$/u.exec(first);
  const layerName = nameMatch?.[1]?.trim();
  if (layerName === undefined || layerName.length === 0) {
    return null;
  }

  const warnings: string[] = [];
  const histogram: SurfaceFlingerHistogramBucket[] = [];
  let averageFps: number | undefined;
  let totalFrames: number | undefined;
  for (const line of sectionLines.slice(1)) {
    averageFps ??= parseNumber(line, [
      /average\s*fps\s*[:=]\s*(\d+(?:\.\d+)?)/iu,
      /avg\s*fps\s*[:=]\s*(\d+(?:\.\d+)?)/iu
    ]);
    totalFrames ??= parseNumber(line, [
      /total\s*frames\s*[:=]\s*(\d+)/iu,
      /presented\s*frames\s*[:=]\s*(\d+)/iu
    ]);
    const bucket = parseHistogramLine(line);
    if (bucket !== null) {
      histogram.push(bucket);
    } else if (/histogram|bucket|present-to-present/iu.test(line) && !/present-to-present/iu.test(line)) {
      warnings.push(`Malformed histogram line: ${line.trim()}`);
    }
  }

  const layer: SurfaceFlingerLayerStats = {
    layerName,
    rawSection,
    warnings
  };
  if (averageFps !== undefined) {
    layer.averageFps = averageFps;
  }
  if (totalFrames !== undefined) {
    layer.totalFrames = totalFrames;
  }
  if (histogram.length > 0) {
    layer.presentToPresentHistogram = histogram;
    layer.frameTimeMsSamplesApprox = histogram.flatMap((bucket) =>
      Array.from({ length: Math.min(bucket.count, 200) }, () => bucket.bucketMs)
    );
  }
  return layer;
}

export function parseSurfaceFlingerTimestats(output: string): SurfaceFlingerTimestatsResult {
  const warnings: string[] = [];
  const layers: SurfaceFlingerLayerStats[] = [];
  let current: string[] = [];

  if (output.trim().length === 0) {
    return { layers, warnings: ["SurfaceFlinger timestats output was empty."] };
  }

  for (const line of output.split(/\r?\n/u)) {
    const trimmed = line.trim();
    const startsLayer = /^(?:Layer(?:\s+name)?|layerName)\s*[:=]/iu.test(trimmed);
    if (startsLayer && current.length > 0) {
      const layer = buildLayer(current);
      if (layer === null) {
        warnings.push(`Malformed SurfaceFlinger timestats section: ${current[0] ?? ""}`);
      } else {
        layers.push(layer);
      }
      current = [];
    }
    if (trimmed.length > 0) {
      current.push(trimmed);
    }
  }
  if (current.length > 0) {
    const layer = buildLayer(current);
    if (layer === null) {
      warnings.push(`Malformed SurfaceFlinger timestats section: ${current[0] ?? ""}`);
    } else {
      layers.push(layer);
    }
  }
  if (layers.length === 0) {
    warnings.push("No SurfaceFlinger layer timestats were parsed.");
  }
  return { layers, warnings };
}
