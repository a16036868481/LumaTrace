interface PackagingDiagnosticsExportButtonProps {
  onExport: () => void;
}

export function PackagingDiagnosticsExportButton({ onExport }: PackagingDiagnosticsExportButtonProps) {
  return (
    <button className="button button-secondary" type="button" onClick={onExport}>
      Refresh packaging diagnostics
    </button>
  );
}
