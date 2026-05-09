import type { Platform } from "../models/common";
import type {
  MetricAvailability,
  MetricAvailabilityStatus
} from "../models/MetricAvailability";
import { METRIC_NAMES, type MetricName } from "./metricNames";

export interface BuildCapabilityOptions {
  metricName: string;
  platform: Platform;
  status: MetricAvailabilityStatus;
  reason?: string;
  suggestedAction?: string;
  source?: string;
}

export const CORE_METRIC_NAMES: readonly MetricName[] = Object.values(METRIC_NAMES);

export function buildCapability(options: BuildCapabilityOptions): MetricAvailability {
  return { ...options };
}

export function buildUnavailableCapability(
  metricName: string,
  platform: Platform,
  reason: string,
  suggestedAction?: string
): MetricAvailability {
  const capability: MetricAvailability = {
    metricName,
    platform,
    status: "unavailable",
    reason
  };

  if (suggestedAction !== undefined) {
    capability.suggestedAction = suggestedAction;
  }

  return capability;
}

export function buildRequiresToolCapability(
  metricName: string,
  platform: Platform,
  toolName: string,
  suggestedAction?: string
): MetricAvailability {
  const capability: MetricAvailability = {
    metricName,
    platform,
    status: "requires_tool",
    reason: `${toolName} is required for this metric.`,
    source: toolName
  };

  if (suggestedAction !== undefined) {
    capability.suggestedAction = suggestedAction;
  }

  return capability;
}

export function buildExperimentalCapability(
  metricName: string,
  platform: Platform,
  reason: string,
  source?: string
): MetricAvailability {
  const capability: MetricAvailability = {
    metricName,
    platform,
    status: "experimental",
    reason
  };

  if (source !== undefined) {
    capability.source = source;
  }

  return capability;
}
