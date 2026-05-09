import type { Session } from "../api/types";

export function SessionStatusBadge({ status }: { status: Session["status"] | "none" }) {
  return <span className={`session-badge session-badge--${status}`}>session: {status}</span>;
}
