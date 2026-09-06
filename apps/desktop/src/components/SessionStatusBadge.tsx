import type { Session } from "../api/types";
import { useI18n } from "../i18n/I18nProvider";

const statusKeys = {
  none: "session.status.none",
  created: "report.status.created",
  running: "report.status.running",
  paused: "report.status.paused",
  stopped: "report.status.stopped",
  failed: "report.status.failed"
} as const;

export function SessionStatusBadge({ status }: { status: Session["status"] | "none" }) {
  const { t } = useI18n();
  return <span className={`session-badge session-badge--${status}`}>{t("common.status")}: {t(statusKeys[status])}</span>;
}
