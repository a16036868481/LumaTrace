export interface DisplayRefreshInfo {
  activeRefreshRate?: number;
  supportedRefreshRates?: number[];
  activeDisplayId?: string;
  warnings: string[];
}

function uniqueSorted(values: readonly number[]): number[] {
  return [...new Set(values.filter((value) => Number.isFinite(value) && value > 0))]
    .sort((left, right) => left - right);
}

export function parseDisplayRefreshRate(output: string): DisplayRefreshInfo {
  const warnings: string[] = [];
  const allRates: number[] = [];
  let activeRefreshRate: number | undefined;
  let activeDisplayId: string | undefined;

  if (output.trim().length === 0) {
    return { warnings: ["Display output was empty."] };
  }

  for (const line of output.split(/\r?\n/u)) {
    const displayMatch = /Display\s+(?:Id\s*)?(\d+)/iu.exec(line) ?? /mDisplayId\s*=\s*(\d+)/iu.exec(line);
    if (activeDisplayId === undefined && displayMatch?.[1] !== undefined) {
      activeDisplayId = displayMatch[1];
    }
    const lineRates: number[] = [];
    for (const match of line.matchAll(/(\d+(?:\.\d+)?)\s*(?:fps|Hz)/giu)) {
      const rate = Number.parseFloat(match[1] ?? "");
      if (Number.isFinite(rate)) {
        allRates.push(rate);
        lineRates.push(rate);
      }
    }
    for (const match of line.matchAll(/(?:fps|refreshRate)\s*[=:]\s*(\d+(?:\.\d+)?)/giu)) {
      const rate = Number.parseFloat(match[1] ?? "");
      if (Number.isFinite(rate)) {
        allRates.push(rate);
        lineRates.push(rate);
      }
    }
    const activeLine = /mActiveMode|activeMode|activeConfig|active.*refresh|refreshRate/iu.test(line);
    const activeMatch = /(\d+(?:\.\d+)?)\s*(?:fps|Hz).*active/iu.exec(line);
    if (activeRefreshRate === undefined && activeLine && lineRates.length > 0) {
      activeRefreshRate = lineRates[0];
    } else if (activeRefreshRate === undefined && activeMatch?.[1] !== undefined) {
      const parsed = Number.parseFloat(activeMatch[1]);
      if (Number.isFinite(parsed) && parsed > 0) {
        activeRefreshRate = parsed;
      }
    }
  }

  const supportedRefreshRates = uniqueSorted(allRates);
  const result: DisplayRefreshInfo = { warnings };
  if (activeRefreshRate !== undefined) {
    result.activeRefreshRate = activeRefreshRate;
  } else {
    warnings.push("No active display refresh rate was parsed.");
  }
  if (supportedRefreshRates.length > 0) {
    result.supportedRefreshRates = supportedRefreshRates;
  }
  if (activeDisplayId !== undefined) {
    result.activeDisplayId = activeDisplayId;
  }
  return result;
}
