import { PackagingDiagnosticsPreview } from "./PackagingDiagnosticsPreview";

interface PackagingDiagnosticsPanelProps {
  diagnostics: string | null;
}

export function PackagingDiagnosticsPanel({ diagnostics }: PackagingDiagnosticsPanelProps) {
  return (
    <section className="panel" aria-label="Packaging diagnostics">
      <h2>Packaging Diagnostics</h2>
      <p className="notice-text">
        Packaging diagnostics are sanitized. Auth tokens, full local paths, raw command output, and
        report contents are not displayed here.
      </p>
      <p className="notice-text">Raw logs, raw CSV, logcat, and bugreport data are not included.</p>
      <PackagingDiagnosticsPreview diagnostics={diagnostics} />
    </section>
  );
}
