import type { ReconnectableStreamStatus } from "../hooks/useReconnectableSessionStream";
import { useI18n } from "../i18n/I18nProvider";

const statusKeys: Record<ReconnectableStreamStatus, `connection.${ReconnectableStreamStatus}`> = {
  idle: "connection.idle",
  connecting: "connection.connecting",
  open: "connection.open",
  reconnecting: "connection.reconnecting",
  closed: "connection.closed",
  error: "connection.error",
  stopped: "connection.stopped"
};

export function ConnectionStatusBadge({
  status,
  retryCount
}: {
  status: ReconnectableStreamStatus;
  retryCount: number;
}) {
  const { t } = useI18n();
  return (
    <span className={`connection-badge connection-badge--${status}`}>
      {t("connection.label")}: {t(statusKeys[status])}
      {retryCount > 0 ? ` (${retryCount})` : ""}
    </span>
  );
}
