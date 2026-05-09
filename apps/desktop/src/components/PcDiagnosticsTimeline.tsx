import type { DiagnosticRecord } from "../api/types";
import { DiagnosticsTimeline } from "./DiagnosticsTimeline";

interface PcDiagnosticsTimelineProps {
  diagnostics: DiagnosticRecord[];
}

export function PcDiagnosticsTimeline({ diagnostics }: PcDiagnosticsTimelineProps) {
  return <DiagnosticsTimeline diagnostics={diagnostics.filter((item) => item.category.startsWith("pc"))} />;
}
