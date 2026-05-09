import type {
  AndroidDiagnosticCreateInput,
  AndroidDiagnosticEvent,
  AndroidDiagnosticsListOptions,
  AndroidDiagnosticsSummary,
  AndroidReportDiagnosticsSection
} from "./AndroidDiagnosticEvent";
import { sanitizeAndroidDiagnostic } from "./sanitizeAndroidDiagnostic";

const IMPORTANT_CODES = new Set([
  "APP_START_FAILED",
  "APP_STARTED",
  "APP_FORCE_STOPPED",
  "PID_MISSING",
  "PID_REBOUND",
  "MEMINFO_FALLBACK_PROC_STATUS",
  "NETWORK_FALLBACK_DEVICE_LEVEL",
  "NETWORK_COUNTER_RESET",
  "FPS_LAYER_MATCH_NONE",
  "FPS_LAYER_MATCH_AMBIGUOUS",
  "FPS_PROBE_RESULT",
  "FPS_PROBE_FAILED",
  "ADB_TIMEOUT",
  "ADB_SLOW_COMMAND"
]);

function countBy(events: readonly AndroidDiagnosticEvent[], key: keyof AndroidDiagnosticEvent): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const event of events) {
    const value = event[key];
    if (typeof value === "string") {
      counts[value] = (counts[value] ?? 0) + 1;
    }
  }
  return counts;
}

function createId(): string {
  return `android-diag-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function matches(event: AndroidDiagnosticEvent, options: AndroidDiagnosticsListOptions): boolean {
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
  if (options.fromTimestampMs !== undefined && event.timestampMs < options.fromTimestampMs) {
    return false;
  }
  if (options.toTimestampMs !== undefined && event.timestampMs > options.toTimestampMs) {
    return false;
  }
  return true;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

export class AndroidDiagnosticsTimeline {
  private readonly events: AndroidDiagnosticEvent[] = [];

  add(input: AndroidDiagnosticCreateInput): void {
    const event: AndroidDiagnosticEvent = sanitizeAndroidDiagnostic({
      ...input,
      id: input.id ?? createId(),
      timestampMs: input.timestampMs ?? Date.now()
    });
    this.events.push(event);
  }

  list(options: AndroidDiagnosticsListOptions = {}): AndroidDiagnosticEvent[] {
    const events = this.events
      .filter((event) => matches(event, options))
      .sort((left, right) => left.timestampMs - right.timestampMs || left.id.localeCompare(right.id));
    return options.limit === undefined ? [...events] : events.slice(-Math.max(0, options.limit));
  }

  listBySession(sessionId: string): AndroidDiagnosticEvent[] {
    return this.list({ sessionId });
  }

  summarize(sessionId?: string): AndroidDiagnosticsSummary {
    const events = sessionId === undefined ? this.list() : this.listBySession(sessionId);
    const importantEvents = events.filter(
      (event) => IMPORTANT_CODES.has(event.code) || event.level === "error"
    );
    return {
      total: events.length,
      byLevel: countBy(events, "level"),
      byCategory: countBy(events, "category"),
      byCode: countBy(events, "code"),
      warnings: events.filter((event) => event.level === "warn").length,
      errors: events.filter((event) => event.level === "error").length,
      importantEvents
    };
  }

  toReportSection(sessionId: string): AndroidReportDiagnosticsSection {
    const diagnosticsTimeline = this.listBySession(sessionId);
    const sourcePrecisionNotices = unique(
      diagnosticsTimeline
        .filter((event) => event.code === "NETWORK_FALLBACK_DEVICE_LEVEL")
        .map(() => "Device-level network counters may include traffic from other apps.")
        .concat(
          diagnosticsTimeline
            .filter((event) => event.category === "fps")
            .map(() => "Android FPS probe is experimental.")
        )
    );
    const fallbackNotices = unique(
      diagnosticsTimeline
        .filter((event) => event.code === "MEMINFO_FALLBACK_PROC_STATUS")
        .map(() => "Memory fell back to /proc/<pid>/status with lower confidence.")
        .concat(
          diagnosticsTimeline
            .filter((event) => event.code === "NETWORK_FALLBACK_DEVICE_LEVEL")
            .map(() => "Network fell back to device-level /proc/net/dev counters.")
        )
    );
    const lifecycleEvents = diagnosticsTimeline.filter((event) => event.category === "lifecycle");
    const processEvents = diagnosticsTimeline.filter((event) => event.category === "process");
    const fpsProbeResult = [...diagnosticsTimeline].reverse().find((event) => event.category === "fps");

    const section: AndroidReportDiagnosticsSection = {
      androidDiagnosticsSummary: this.summarize(sessionId),
      diagnosticsTimeline,
      sourcePrecisionNotices,
      fallbackNotices,
      lifecycleEvents,
      processEvents
    };
    if (fpsProbeResult !== undefined) {
      section.fpsProbeResult = fpsProbeResult;
    }
    if (sourcePrecisionNotices.some((notice) => notice.includes("Device-level network"))) {
      section.networkPrecisionNotice = "Device-level network data is not target-only traffic.";
    }
    return section;
  }
}
