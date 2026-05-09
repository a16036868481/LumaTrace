import type {
  AndroidDiagnosticCreateInput,
  AndroidDiagnosticEvent,
  AndroidDiagnosticsListOptions,
  AndroidDiagnosticsSummary,
  AndroidReportDiagnosticsSection
} from "./AndroidDiagnosticEvent";
import { AndroidDiagnosticsTimeline } from "./AndroidDiagnosticsTimeline";

export class AndroidDiagnosticCollector {
  private readonly timeline: AndroidDiagnosticsTimeline;

  constructor(timeline = new AndroidDiagnosticsTimeline()) {
    this.timeline = timeline;
  }

  add(event: AndroidDiagnosticCreateInput): void {
    try {
      this.timeline.add(event);
    } catch {
      // Diagnostics must never interrupt collection.
    }
  }

  list(options: AndroidDiagnosticsListOptions = {}): AndroidDiagnosticEvent[] {
    return this.timeline.list(options);
  }

  listBySession(sessionId: string): AndroidDiagnosticEvent[] {
    return this.timeline.listBySession(sessionId);
  }

  summarize(sessionId?: string): AndroidDiagnosticsSummary {
    return this.timeline.summarize(sessionId);
  }

  toReportSection(sessionId: string): AndroidReportDiagnosticsSection {
    return this.timeline.toReportSection(sessionId);
  }
}
