import { useI18n } from "../i18n/I18nProvider";
import type { WindowsFpsAccessStatus } from "../tauri/windowsFpsAccess";

interface WindowsFpsAccessCardProps {
  status: WindowsFpsAccessStatus | null;
  busy: boolean;
  cancelled: boolean;
  showAction?: boolean;
  onEnable: () => void;
  onRefresh: () => void;
}

export function WindowsFpsAccessCard({
  status,
  busy,
  cancelled,
  showAction = true,
  onEnable,
  onRefresh
}: WindowsFpsAccessCardProps) {
  const { t } = useI18n();

  if (status === null || !status.supported || status.state === "ready") {
    return null;
  }

  const restartRequired = status.state === "restart_required";
  const failed = status.state === "error";
  const title = restartRequired
    ? t("session.fpsAccessRestartTitle")
    : failed
      ? t("session.fpsAccessErrorTitle")
      : t("session.fpsAccessTitle");
  const body = restartRequired
    ? t("session.fpsAccessRestartBody")
    : cancelled
      ? t("session.fpsAccessCancelledBody")
      : failed
        ? t("session.fpsAccessErrorBody")
        : t("session.fpsAccessBody");

  return (
    <section
      aria-label={title}
      className={`fps-access-card fps-access-card--${restartRequired ? "restart" : failed ? "error" : "setup"}`}
    >
      <span className="fps-access-card__icon" aria-hidden="true">
        {restartRequired ? "✓" : "FPS"}
      </span>
      <div className="fps-access-card__copy">
        <strong>{title}</strong>
        <p>{body}</p>
      </div>
      {showAction ? (
        <button
          className={restartRequired || failed ? "button button-secondary" : "button button-primary"}
          disabled={busy}
          type="button"
          onClick={restartRequired || failed ? onRefresh : onEnable}
        >
          {busy
            ? t("session.fpsAccessEnabling")
            : restartRequired || failed
              ? t("session.fpsAccessRecheck")
              : t("session.fpsAccessEnable")}
        </button>
      ) : null}
    </section>
  );
}
