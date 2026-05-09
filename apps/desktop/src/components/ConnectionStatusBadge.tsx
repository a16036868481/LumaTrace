import type { ReconnectableStreamStatus } from "../hooks/useReconnectableSessionStream";

export function ConnectionStatusBadge({
  status,
  retryCount
}: {
  status: ReconnectableStreamStatus;
  retryCount: number;
}) {
  return (
    <span className={`connection-badge connection-badge--${status}`}>
      WS: {status}
      {retryCount > 0 ? ` (${retryCount})` : ""}
    </span>
  );
}
