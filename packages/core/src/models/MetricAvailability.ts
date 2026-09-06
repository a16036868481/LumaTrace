import type { Platform } from "./common";

export type MetricAvailabilityStatus =
  | "available"
  | "unavailable"
  | "requires_tool"
  | "requires_permission"
  | "experimental";

export interface MetricAvailability {
  metricName: string;
  platform: Platform;
  status: MetricAvailabilityStatus;
  reason?: string;
  suggestedAction?: string;
  source?: string;
}
