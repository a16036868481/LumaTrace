import type { EventMarker } from "../api/types";
import { formatTimestamp } from "../utils/format";
import { useI18n } from "../i18n/I18nProvider";

export function MarkerTimeline({ markers }: { markers: EventMarker[] }) {
  const { t } = useI18n();
  if (markers.length === 0) {
    return <p className="muted-text">{t("marker.empty")}</p>;
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
