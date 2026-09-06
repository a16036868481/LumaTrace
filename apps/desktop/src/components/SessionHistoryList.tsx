import type { SessionHistoryItem } from "../hooks/useSessionHistory";
import { useI18n } from "../i18n/I18nProvider";
import { formatDuration } from "../utils/format";
import { EmptyState } from "./EmptyState";

const historyStatusKeys = {
  created: "report.status.created",
  running: "report.status.running",
  paused: "report.status.paused",
  stopped: "report.status.stopped",
  failed: "report.status.failed"
} as const;

export function SessionHistoryList({
  items,
  localOnly = false,
  onResume,
  onCopy
}: {
  items: SessionHistoryItem[];
  localOnly?: boolean;
  onResume: (item: SessionHistoryItem) => void;
  onCopy?: (sessionId: string) => void;
}) {
  const { t } = useI18n();

  if (items.length === 0) {
    return <EmptyState title={t("history.noRecentSessions")} message={t("history.noRecentSessionsMessage")} />;
  }

  return (
    <div className="table-wrap">
      {localOnly ? <p className="muted-text">{t("history.localOnly")}</p> : null}
      <table aria-label={t("history.tableLabel")}>
        <thead>
          <tr>
            <th>{t("common.name")}</th>
            <th>{t("common.status")}</th>
            <th>{t("common.target")}</th>
            <th>{t("history.duration")}</th>
            <th>{t("common.source")}</th>
            <th>{t("common.action")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.sessionId}>
              <td>
                <strong>{item.name}</strong>
                <div className="muted-text">{item.sessionId}</div>
              </td>
              <td>{t(historyStatusKeys[item.status])}</td>
              <td>{item.targetName ?? item.targetId}</td>
              <td>
                {item.startedAt !== undefined && item.endedAt !== undefined
                  ? formatDuration(item.endedAt - item.startedAt)
                  : t("common.na")}
              </td>
              <td>{t(item.source === "server" ? "history.source.server" : "history.source.local")}</td>
              <td>
                <div className="summary-row">
                  <button className="button button-secondary" type="button" onClick={() => onResume(item)}>
                    {t("history.resume")}
                  </button>
                  <a className="button" href={`/report?sessionId=${encodeURIComponent(item.sessionId)}`}>
                    {t("history.viewReport")}
                  </a>
                  <button className="button" type="button" onClick={() => onCopy?.(item.sessionId)}>
                    {t("history.copySessionId")}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
