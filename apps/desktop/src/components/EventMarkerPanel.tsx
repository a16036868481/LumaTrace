import { type RefObject, useState } from "react";
import type { EventMarker } from "../api/types";

export interface EventMarkerPanelProps {
  disabled?: boolean;
  labelInputRef?: RefObject<HTMLInputElement | null>;
  onAdd: (input: { label: string; description?: string }) => Promise<EventMarker>;
}

export function EventMarkerPanel({ disabled = false, labelInputRef, onAdd }: EventMarkerPanelProps) {
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [markers, setMarkers] = useState<EventMarker[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(): Promise<void> {
    if (label.trim().length === 0) {
      setError("Marker label is required.");
      return;
    }
    setError(null);
    const input: { label: string; description?: string } = {
      label: label.trim()
    };
    if (description.trim().length > 0) {
      input.description = description.trim();
    }
    const marker = await onAdd(input);
    setMarkers((current) => [marker, ...current]);
    setLabel("");
    setDescription("");
  }

  return (
    <div className="marker-editor">
      <h3>Event Markers</h3>
      <div className="form-grid">
        <label>
          Label
          <input ref={labelInputRef} value={label} onChange={(event) => setLabel(event.target.value)} />
        </label>
        <label>
          Description
          <input value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
      </div>
      {error !== null ? <p className="form-error">{error}</p> : null}
      <button className="button button-secondary" type="button" disabled={disabled} onClick={handleSubmit}>
        Add Marker
      </button>
      {markers.length > 0 ? (
        <ul className="marker-list">
          {markers.map((marker) => (
            <li key={marker.id}>
              <strong>{marker.label}</strong>
              {marker.description !== undefined ? <span>{marker.description}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
