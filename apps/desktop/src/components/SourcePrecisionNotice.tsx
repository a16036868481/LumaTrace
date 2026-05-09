export function SourcePrecisionNotice({ notice }: { notice?: string }) {
  return (
    <section className="panel source-notice">
      <h2>Source And Precision</h2>
      <p>
        {notice ??
          "Metrics include source, precision, and confidence metadata for every emitted sample."}{" "}
        Missing or unavailable metrics are shown as N/A, never as fabricated zero values.
      </p>
    </section>
  );
}
