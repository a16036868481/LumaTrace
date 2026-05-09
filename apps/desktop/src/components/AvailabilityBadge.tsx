import type { MetricAvailability } from "../api/types";

const labels: Record<MetricAvailability["status"], string> = {
  available: "Available",
  unavailable: "Unavailable",
  requires_tool: "Requires Tool",
  requires_permission: "Requires Permission",
  requires_xcode: "Requires Xcode",
  requires_developer_signing: "Requires Signing",
  requires_manual_trace: "Manual Trace",
  experimental: "Experimental"
};

export function AvailabilityBadge({ availability }: { availability: MetricAvailability }) {
  return (
    <span className={`availability-badge availability-badge--${availability.status}`}>
      {availability.metricName}: {labels[availability.status]}
    </span>
  );
}
