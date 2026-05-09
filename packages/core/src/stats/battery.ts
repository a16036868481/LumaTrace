export interface BatteryLevelSample {
  timestampMs: number;
  levelPercent: number;
}

export interface BatterySummary {
  batteryDrainPercent?: number;
  thermalEvents?: number;
}

export function calculateBatteryDrainPercent(
  first: BatteryLevelSample,
  last: BatteryLevelSample
): number | undefined {
  if (!Number.isFinite(first.levelPercent) || !Number.isFinite(last.levelPercent)) {
    return undefined;
  }

  return Math.max(0, first.levelPercent - last.levelPercent);
}

export function summarizeBattery(
  samples: readonly BatteryLevelSample[],
  thermalEvents: readonly unknown[] = []
): BatterySummary {
  const summary: BatterySummary = {};
  const first = samples[0];
  const last = samples[samples.length - 1];

  if (first !== undefined && last !== undefined) {
    const drain = calculateBatteryDrainPercent(first, last);
    if (drain !== undefined) {
      summary.batteryDrainPercent = drain;
    }
  }

  if (thermalEvents.length > 0) {
    summary.thermalEvents = thermalEvents.length;
  }

  return summary;
}
