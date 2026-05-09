import type { PackagedStatusResponse } from "../api/types";

export function summarizeLogRotation(status: PackagedStatusResponse | null): string {
  const logs = status?.logs;
  if (logs === undefined) {
    return "N/A";
  }
  const rotated = logs.lastRotationResult?.rotatedFiles.length ?? 0;
  const warnings = logs.lastRotationResult?.warnings.length ?? 0;
  return `${rotated} rotated, ${warnings} warnings`;
}
