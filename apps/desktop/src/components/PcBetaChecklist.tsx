export function PcBetaChecklist() {
  return (
    <section className="panel" aria-label="PC beta checklist">
      <h2>PC Beta Checklist</h2>
      <ul>
        <li>Local PC process CPU and memory are supported on Windows.</li>
        <li>PresentMon capture is explicit, experimental, and disabled by default.</li>
        <li>No FPS is emitted for missing, no-match, ambiguous, failed, or aborted captures.</li>
        <li>Reports do not include raw CSV, full local paths, command lines, or stack traces.</li>
      </ul>
    </section>
  );
}
