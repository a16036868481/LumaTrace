export type ToolName =
  | "adb"
  | "PresentMon";

export interface ToolStatus {
  toolName: ToolName;
  status: "available" | "missing" | "unsupported" | "unknown";
  version?: string;
  path?: string;
  reason?: string;
  suggestedAction?: string;
}
