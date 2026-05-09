import type { Platform } from "./common";

export type MetricAvailabilityStatus =
  | "available"
  | "unavailable"
  | "requires_tool"
  | "requires_permission"
  | "requires_xcode"
  | "requires_developer_signing"
  | "requires_manual_trace"
  | "experimental";

export interface MetricAvailability {
  metricName: string;
  platform: Platform;
  status: MetricAvailabilityStatus;
  reason?: string;
  suggestedAction?: string;
  source?: string;
}
