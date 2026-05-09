import type { Tags } from "./common";

export interface EventMarker {
  id: string;
  sessionId: string;
  timestampMs: number;
  label: string;
  description?: string;
  tags?: Tags;
}
