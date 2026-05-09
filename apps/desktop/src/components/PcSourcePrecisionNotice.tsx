export function PcSourcePrecisionNotice() {
  return (
    <div className="panel" role="note" aria-label="PC source precision notice">
      <p>
        PC FPS and frame time metrics are sourced from explicit PresentMon CSV capture and remain
        experimental. CPU and memory continue even when PresentMon is missing or capture has no data.
      </p>
    </div>
  );
}
