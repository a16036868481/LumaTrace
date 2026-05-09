export type ToolName =
  | "adb"
  | "xcrun"
  | "xctrace"
  | "ideviceinfo"
  | "idevice_id"
  | "idevicesyslog"
  | "PresentMon";

export interface ToolStatus {
  toolName: ToolName;
  status: "available" | "missing" | "unsupported" | "unknown";
  version?: string;
  path?: string;
  reason?: string;
  suggestedAction?: string;
}
