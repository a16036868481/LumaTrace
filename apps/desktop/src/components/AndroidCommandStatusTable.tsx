import { JsonPreview } from "./JsonPreview";

export interface AndroidCommandStatusTableProps {
  health: unknown;
}

export function AndroidCommandStatusTable({ health }: AndroidCommandStatusTableProps) {
  if (health === null || health === undefined) {
    return null;
  }

  return (
    <section className="panel" aria-label="Android command status">
      <h2>Android Health</h2>
      <JsonPreview value={health} />
    </section>
  );
}
