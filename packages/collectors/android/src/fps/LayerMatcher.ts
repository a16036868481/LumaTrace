import type { SurfaceLayerInfo } from "../parsers/parseSurfaceFlingerLayers";
import type { SurfaceFlingerLayerStats } from "../parsers/parseSurfaceFlingerTimestats";

export interface LayerMatchCandidate {
  layerName: string;
  score: number;
  reason: string;
}

export interface LayerMatchResult {
  matchedLayerName?: string;
  candidates: LayerMatchCandidate[];
  confidence: "high" | "medium" | "low" | "none";
  ambiguity: boolean;
  reason: string;
}

function isSystemLayer(layerName: string): boolean {
  return /statusbar|navigationbar|systemui|wallpaper|inputmethod|bootanimation/iu.test(layerName);
}

function isNonRenderableHelperLayer(layerName: string): boolean {
  const lower = layerName.toLowerCase();
  return (
    lower.startsWith("activityrecord{") ||
    lower.startsWith("background for ") ||
    lower.startsWith("bounds for ") ||
    lower.includes("animation leash") ||
    lower.includes("dim layer")
  );
}

function scoreLayer(packageName: string, layerName: string): LayerMatchCandidate | null {
  const lower = layerName.toLowerCase();
  const packageLower = packageName.toLowerCase();
  if (isSystemLayer(layerName) || isNonRenderableHelperLayer(layerName)) {
    return null;
  }
  if (lower === packageLower) {
    return { layerName, score: 100, reason: "Exact package layer name." };
  }
  if (/unity|unreal|flutter/iu.test(layerName) && lower.includes(packageLower)) {
    return { layerName, score: 82, reason: "Engine layer contains the target package." };
  }
  if (
    lower === `surfaceview - ${packageLower}` ||
    lower === `surfaceview[${packageLower}]` ||
    lower.includes(`surfaceview - ${packageLower}`) ||
    lower.includes(`surfaceview[${packageLower}]`) ||
    lower.includes(`surfaceview[${packageLower}/`)
  ) {
    if (lower.includes("(blast)")) {
      return { layerName, score: 105, reason: "BLAST SurfaceView layer contains the target package." };
    }
    return { layerName, score: 95, reason: "SurfaceView layer contains the target package." };
  }
  if (lower.includes(`${packageLower}:`)) {
    return { layerName, score: 70, reason: "Layer contains a target package service process." };
  }
  if (lower.includes(packageLower)) {
    return { layerName, score: 80, reason: "Layer contains the target package." };
  }
  return null;
}

function confidenceFor(score: number, ambiguity: boolean): LayerMatchResult["confidence"] {
  if (ambiguity) {
    return "low";
  }
  if (score >= 90) {
    return "high";
  }
  if (score >= 75) {
    return "medium";
  }
  if (score > 0) {
    return "low";
  }
  return "none";
}

export function matchLayer(options: {
  packageName: string;
  targetName?: string;
  layers?: readonly SurfaceLayerInfo[];
  timestatsLayers?: readonly SurfaceFlingerLayerStats[];
}): LayerMatchResult {
  const layerNames = new Set<string>();
  for (const layer of options.layers ?? []) {
    layerNames.add(layer.name);
  }
  for (const layer of options.timestatsLayers ?? []) {
    layerNames.add(layer.layerName);
  }
  const candidates = [...layerNames]
    .map((layerName) => scoreLayer(options.packageName, layerName))
    .filter((candidate): candidate is LayerMatchCandidate => candidate !== null)
    .sort((left, right) => right.score - left.score || left.layerName.localeCompare(right.layerName));

  if (candidates.length === 0) {
    return {
      candidates: [],
      confidence: "none",
      ambiguity: false,
      reason: "No SurfaceFlinger layer matched the target package."
    };
  }

  const top = candidates[0]!;
  const next = candidates[1];
  const ambiguity = next !== undefined && top.score - next.score <= 5;
  return {
    matchedLayerName: top.layerName,
    candidates,
    confidence: confidenceFor(top.score, ambiguity),
    ambiguity,
    reason: ambiguity
      ? "Multiple SurfaceFlinger layer candidates have similar scores."
      : top.reason
  };
}
