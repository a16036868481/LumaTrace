import type { ConnectionType, Platform, Tags } from "./common";
import type { MetricAvailability } from "./MetricAvailability";

export interface Device {
  id: string;
  platform: Platform;
  name: string;
  osVersion?: string;
  connectionType: ConnectionType;
  capabilities: MetricAvailability[];
  tags?: Tags;
}
