import type { ReactNode } from "react";

export function ReportSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel report-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
