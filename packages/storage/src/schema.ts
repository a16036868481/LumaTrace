export const INITIAL_MIGRATION_VERSION = "001_initial";

export const TABLE_NAMES = [
  "schema_migrations",
  "devices",
  "targets",
  "sessions",
  "metric_events_raw",
  "metric_events_downsampled",
  "event_markers",
  "reports",
  "tool_status",
  "diagnostics"
] as const;

export type TableName = (typeof TABLE_NAMES)[number];
