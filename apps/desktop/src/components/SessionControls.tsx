import type { Session } from "../api/types";
import { useI18n } from "../i18n/I18nProvider";

export interface SessionControlsProps {
  session: Session | null;
  creating?: boolean;
  starting?: boolean;
  stopping?: boolean;
  onCreate: () => void;
  onStart: () => void;
  onStop: () => void;
}

export function SessionControls({
  session,
  creating = false,
  starting = false,
  stopping = false,
  onCreate,
  onStart,
  onStop
}: SessionControlsProps) {
  const { t } = useI18n();
  const status = session?.status ?? "none";
  const isRunning = session?.status === "running";
  const isStopped = session?.status === "stopped";

  return (
    <div className="session-controls">
      <button className="button" type="button" disabled={isRunning || creating} onClick={onCreate}>
        {creating ? t("session.creatingButton") : t("session.createButton")}
      </button>
      <button
        className="button button-primary"
        type="button"
        disabled={session === null || isRunning || isStopped || starting}
        onClick={onStart}
      >
        {starting ? t("session.startingButton") : t("session.startButton")}
      </button>
      <button
        className="button button-danger"
        type="button"
        disabled={session === null || isStopped || stopping}
        onClick={onStop}
      >
        {stopping ? t("session.stoppingButton") : t("session.stopButton")}
      </button>
      <span className="status-pill">
        {t("common.status")}: {status}
      </span>
    </div>
  );
}
