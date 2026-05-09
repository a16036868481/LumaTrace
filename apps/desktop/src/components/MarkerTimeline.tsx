import type { EventMarker } from "../api/types";
import { formatTimestamp } from "../utils/format";

export function MarkerTimeline({ markers }: { markers: EventMarker[] }) {
  if (markers.length === 0) {
    return <p className="muted-text">No markers yet.</p>;
  }

  return (
    <ol className="marker-timeline">
      {markers.map((marker) => (
        <li key={marker.id}>
          <time>{formatTimestamp(marker.timestampMs)}</time>
          <strong>{marker.label}</strong>
          {marker.description !== undefined ? <span>{marker.description}</span> : null}
        </li>
      ))}
    </ol>
  );
}
