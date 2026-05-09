export function formatNumber(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "N/A";
  }
  return value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  });
}

export function formatDuration(durationMs: number | null | undefined): string {
  if (durationMs === null || durationMs === undefined || Number.isNaN(durationMs)) {
    return "N/A";
  }

  if (durationMs < 1000) {
    return `${Math.round(durationMs)} ms`;
  }

  const seconds = durationMs / 1000;
  if (seconds < 60) {
    return `${formatNumber(seconds, 1)} s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

export function formatMetricValue(
  value: number | null | undefined,
  unit?: string,
  digits = 1
): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "N/A";
  }

  if (unit === "%") {
    return `${formatNumber(value, digits)}%`;
  }
  if (unit === "MB") {
    return `${formatNumber(value, digits)} MB`;
  }
  if (unit === "ms") {
    return `${formatNumber(value, digits)} ms`;
  }
  if (unit === "fps") {
    return `${formatNumber(value, digits)} FPS`;
  }
  if (unit === undefined || unit.length === 0) {
    return formatNumber(value, digits);
  }
  return `${formatNumber(value, digits)} ${unit}`;
}

export function formatTimestamp(timestampMs: number | undefined): string {
  if (timestampMs === undefined) {
    return "N/A";
  }
  return new Date(timestampMs).toLocaleTimeString();
}
