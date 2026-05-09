import type { EventMarker, Session } from "../api/types";
import { formatDuration, formatTimestamp } from "../utils/format";

export function ReportMetricTimeline({
  session,
  markers,
  metricCount,
  metricStartMs,
  metricEndMs,
  metricSampleSource = "raw",
  metricSampleCount,
  bucketSizeMs
}: {
  session?: Session | null;
  markers: EventMarker[];
  metricCount: number;
  metricStartMs?: number;
  metricEndMs?: number;
  metricSampleSource?: "raw" | "downsampled";
  metricSampleCount?: number;
  bucketSizeMs?: number;
}) {
  const rows = [
    ...(session?.startedAt !== undefined
      ? [{ time: session.startedAt, label: "Session start", description: session.name }]
      : []),
    ...markers.map((marker) => ({
      time: marker.timestampMs,
      label: marker.label,
      description: marker.description ?? "Marker"
    })),
    ...(session?.endedAt !== undefined
      ? [{ time: session.endedAt, label: "Session stop", description: session.status }]
      : [])
  ].sort((a, b) => a.time - b.time);

  return (
    <section className="panel">
      <h2>Timeline</h2>
      <p>
        Metrics: {metricCount} {metricStartMs !== undefined ? `from ${formatTimestamp(metricStartMs)}` : ""}
        {metricEndMs !== undefined ? ` to ${formatTimestamp(metricEndMs)}` : ""}
      </p>
      {metricSampleSource === "downsampled" ? (
        <p className="notice-text">
          Timeline range uses {metricSampleCount ?? "N/A"} downsampled buckets
          {bucketSizeMs !== undefined ? ` at ${formatDuration(bucketSizeMs)} per bucket` : ""}.
        </p>
      ) : null}
      {rows.length === 0 ? (
        <p className="muted-text">No timeline events are available.</p>
      ) : (
        <ul className="marker-timeline">
          {rows.map((row) => (
            <li key={`${row.time}-${row.label}`}>
              <strong>{formatTimestamp(row.time)}</strong>
              <div>{row.label}</div>
              <span>{row.description}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
