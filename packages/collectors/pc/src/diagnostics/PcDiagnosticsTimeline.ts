import type {
  PcDiagnosticCreateInput,
  PcDiagnosticEvent,
  PcDiagnosticsListOptions,
  PcDiagnosticsSummary
} from "./PcDiagnosticEvent";
import { sanitizePcDiagnostic } from "./sanitizePcDiagnostic";

const IMPORTANT_CODES = new Set([
  "PC_PLATFORM_UNSUPPORTED",
  "PROCESS_LIST_FAILED",
  "PROCESS_NOT_FOUND",
  "PROCESS_EXITED",
  "PID_REUSED",
  "CPU_SAMPLE_FAILED",
  "MEMORY_SAMPLE_FAILED",
  "PRESENTMON_MISSING",
  "PRESENTMON_UNSUPPORTED",
  "PRESENTMON_PERMISSION_LIMITED",
  "PRESENTMON_LOG_ACCESS_USERS_HINT",
  "PRESENTMON_ADMIN_HINT",
  "PRESENTMON_CAPTURE_FAILED",
  "PRESENTMON_CAPTURE_ABORTED",
  "PRESENTMON_CSV_PARSE_WARNING",
  "PRESENTMON_TARGET_NO_MATCH",
  "PRESENTMON_TARGET_AMBIGUOUS",
  "PRESENTMON_PROCESS_EXITED_DURING_CAPTURE",
  "PRESENTMON_PID_REUSED_DURING_CAPTURE"
]);

function createId(): string {
  return `pc-diag-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function countBy(events: readonly PcDiagnosticEvent[], key: keyof PcDiagnosticEvent): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const event of events) {
    const value = event[key];
    if (typeof value === "string") {
      counts[value] = (counts[value] ?? 0) + 1;
    }
  }
  return counts;
}

function matches(event: PcDiagnosticEvent, options: PcDiagnosticsListOptions): boolean {
  if (options.sessionId !== undefined && event.sessionId !== options.sessionId) {
    return false;
  }
  if (options.deviceId !== undefined && event.deviceId !== options.deviceId) {
    return false;
  }
  if (options.targetId !== undefined && event.targetId !== options.targetId) {
    return false;
  }
  if (options.level !== undefined && event.level !== options.level) {
    return false;
  }
  if (options.category !== undefined && event.category !== options.category) {
    return false;
  }
  if (options.code !== undefined && event.code !== options.code) {
    return false;
  }
  return true;
}

export class PcDiagnosticsTimeline {
  private readonly events: PcDiagnosticEvent[] = [];

  add(input: PcDiagnosticCreateInput): PcDiagnosticEvent {
    const event = sanitizePcDiagnostic({
      ...input,
      id: input.id ?? createId(),
      timestampMs: input.timestampMs ?? Date.now()
    });
    this.events.push(event);
    return event;
  }

  list(options: PcDiagnosticsListOptions = {}): PcDiagnosticEvent[] {
    const events = this.events
      .filter((event) => matches(event, options))
      .sort((left, right) => left.timestampMs - right.timestampMs || left.id.localeCompare(right.id));
    return options.limit === undefined ? [...events] : events.slice(-Math.max(0, options.limit));
  }

  listBySession(sessionId: string): PcDiagnosticEvent[] {
    return this.list({ sessionId });
  }

  summarize(sessionId?: string): PcDiagnosticsSummary {
    const events = sessionId === undefined ? this.list() : this.listBySession(sessionId);
    return {
      total: events.length,
      byLevel: countBy(events, "level"),
      byCategory: countBy(events, "category"),
      byCode: countBy(events, "code"),
      warnings: events.filter((event) => event.level === "warn").length,
      errors: events.filter((event) => event.level === "error").length,
      importantEvents: events.filter((event) => IMPORTANT_CODES.has(event.code) || event.level === "error")
    };
  }
}
