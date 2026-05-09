export type SurfaceLayerTypeGuess = "surfaceview" | "textureview" | "app" | "system" | "unknown";

export interface SurfaceLayerInfo {
  name: string;
  rawLine: string;
  packageNameGuess?: string;
  typeGuess: SurfaceLayerTypeGuess;
}

export interface SurfaceFlingerLayerList {
  layers: SurfaceLayerInfo[];
  warnings: string[];
}

const PACKAGE_PATTERN = /[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+){1,}/u;

function normalizeLayerName(line: string): string {
  const quoted = /"([^"]+)"/u.exec(line)?.[1];
  if (quoted !== undefined) {
    return quoted.trim();
  }
  const parenthesized = /\(([^()]+)\)\s*$/u.exec(line)?.[1];
  if (parenthesized !== undefined && !/^0x[0-9a-f]+$/iu.test(parenthesized)) {
    return parenthesized.trim();
  }
  return line.replace(/^[+*\-\s]+/u, "").trim();
}

function guessType(name: string): SurfaceLayerTypeGuess {
  if (/statusbar|navigationbar|wallpaper|inputmethod|systemui|splash screen|bootanimation/iu.test(name)) {
    return "system";
  }
  if (/surfaceview/iu.test(name)) {
    return "surfaceview";
  }
  if (/textureview/iu.test(name)) {
    return "textureview";
  }
  if (PACKAGE_PATTERN.test(name)) {
    return "app";
  }
  return "unknown";
}

export function parseSurfaceFlingerLayers(output: string): SurfaceFlingerLayerList {
  const warnings: string[] = [];
  const layers: SurfaceLayerInfo[] = [];
  if (output.trim().length === 0) {
    return { layers, warnings: ["SurfaceFlinger layer output was empty."] };
  }

  for (const line of output.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (
      trimmed.length === 0 ||
      /^list of layers/i.test(trimmed) ||
      /^surfaceflinger/i.test(trimmed) ||
      /^-/u.test(trimmed)
    ) {
      continue;
    }
    const name = normalizeLayerName(trimmed);
    if (name.length === 0 || /^layer$/iu.test(name)) {
      warnings.push(`Malformed SurfaceFlinger layer line: ${trimmed}`);
      continue;
    }
    const packageNameGuess = PACKAGE_PATTERN.exec(name)?.[0];
    layers.push({
      name,
      rawLine: trimmed,
      ...(packageNameGuess === undefined ? {} : { packageNameGuess }),
      typeGuess: guessType(name)
    });
  }
  if (layers.length === 0) {
    warnings.push("No SurfaceFlinger layers were parsed.");
  }
  return { layers, warnings };
}
