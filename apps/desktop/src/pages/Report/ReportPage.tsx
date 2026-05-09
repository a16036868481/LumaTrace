import { useEffect, useMemo, useState } from "react";
import { exportSession, getSessionDiagnostics, getSessions } from "../../api/endpoints";
import type { ExportFormat, Session } from "../../api/types";
import { getQueryParam } from "../../app/routes";
import { ApiErrorView } from "../../components/ApiErrorView";
import { EmptyState } from "../../components/EmptyState";
import { ExportButtons } from "../../components/ExportButtons";
import { LoadingState } from "../../components/LoadingState";
import { MetricCard } from "../../components/MetricCard";
import { ReportTrendPanel } from "../../components/ReportTrendPanel";
import { ToastList } from "../../components/Toast";
import { useReportDetails } from "../../hooks/useReportDetails";
import { useAsync } from "../../hooks/useAsync";
import { useToasts } from "../../hooks/useToasts";
import { useI18n } from "../../i18n/I18nProvider";
import { normalizeApiError } from "../../api/errors";
import type { ApiError } from "../../api/errors";
import { downloadTextFile } from "../../utils/download";
import { formatDuration, formatTimestamp } from "../../utils/format";

function sessionSortTime(session: Session): number {
  return session.startedAt ?? session.endedAt ?? 0;
}

function getPlatformName(session: { deviceId?: unknown } | null): string {
  if (session === null) {
    return "Local";
  }
  const deviceId = typeof session.deviceId === "string" ? session.deviceId.toLowerCase() : "";
  if (deviceId.includes("android") || deviceId.startsWith("adb:")) {
    return "Android";
  }
  if (deviceId.includes("ios")) {
    return "iOS";
  }
  if (deviceId.includes("pc") || deviceId.includes("windows")) {
    return "Windows";
  }
  return "Local";
}

function getTargetName(
  session: { targetId?: unknown; config?: Record<string, unknown> } | null
): string {
  if (session === null) {
    return "";
  }
  const configTarget = session.config?.targetDisplayName;
  if (typeof configTarget === "string" && configTarget.length > 0) {
    return configTarget;
  }
  const processName = session.config?.processName;
  if (typeof processName === "string" && processName.length > 0) {
    return processName;
  }
  const packageName = session.config?.packageName;
  if (typeof packageName === "string" && packageName.length > 0) {
    return packageName;
  }
  return typeof session.targetId === "string" ? session.targetId : "";
}

function writeReportRoute(sessionId: string): void {
  const url = new URL(window.location.href);
  url.pathname = "/report";
  url.searchParams.set("sessionId", sessionId);
  window.history.replaceState({}, "", url.pathname + url.search);
}

export function ReportPage() {
  const { t } = useI18n();
  const initialSessionId = getQueryParam("sessionId") ?? "";
  const [activeSessionId, setActiveSessionId] = useState(initialSessionId);
  const [exportError, setExportError] = useState<ApiError | null>(null);
  const toasts = useToasts();
  const sessionsState = useAsync(() => getSessions({ limit: 50 }), []);
  const sessionData = Array.isArray(sessionsState.data) ? sessionsState.data : [];
  const sessions = useMemo(
    () => [...sessionData].sort((a, b) => sessionSortTime(b) - sessionSortTime(a)),
    [sessionData]
  );
  const selectedSession = sessions.find((session) => session.id === activeSessionId) ?? null;
  const details = useReportDetails(activeSessionId);
  const diagnosticsState = useAsync(
    () => (activeSessionId.length === 0 ? Promise.resolve([]) : getSessionDiagnostics(activeSessionId)),
    [activeSessionId]
  );
  const summary = details.report?.summary;

  useEffect(() => {
    if (activeSessionId.length === 0 && sessions.length > 0) {
      const nextSessionId = sessions[0]?.id;
      if (nextSessionId !== undefined) {
        setActiveSessionId(nextSessionId);
        writeReportRoute(nextSessionId);
      }
    }
  }, [activeSessionId, sessions]);

  async function handleExport(format: ExportFormat): Promise<void> {
    if (activeSessionId.length === 0) {
      return;
    }
    setExportError(null);
    try {
      downloadTextFile(await exportSession(activeSessionId, format), format, activeSessionId);
      toasts.showToast(t("report.exported", { format: format.toUpperCase() }), "success");
    } catch (caught) {
      setExportError(normalizeApiError(caught));
      toasts.showToast(t("report.exportFailed", { format: format.toUpperCase() }), "error");
    }
  }

  function handleSelectSession(sessionId: string): void {
    setActiveSessionId(sessionId);
    writeReportRoute(sessionId);
  }

  function statusLabel(status: Session["status"] | undefined): string {
    if (status === "created") {
      return t("report.status.created");
    }
    if (status === "running") {
      return t("report.status.running");
    }
    if (status === "paused") {
      return t("report.status.paused");
    }
    if (status === "stopped") {
      return t("report.status.stopped");
    }
    if (status === "failed") {
      return t("report.status.failed");
    }
    return t("common.unknown");
  }

  const sessionForHeader = details.session ?? selectedSession;
  const sessionTitle = sessionForHeader?.name ?? activeSessionId;
  const startedAt = sessionForHeader?.startedAt;
  const endedAt = sessionForHeader?.endedAt;
  const displayDuration =
    summary?.durationMs ??
    (startedAt !== undefined && endedAt !== undefined ? endedAt - startedAt : undefined);
  const diagnosticsCount = Array.isArray(diagnosticsState.data) ? diagnosticsState.data.length : 0;

  return (
    <div className="page">
      <ToastList toasts={toasts.toasts} onDismiss={toasts.dismissToast} />
      <header className="page-header">
        <div>
          <h1>{t("report.title")}</h1>
          <p>{t("report.subtitle")}</p>
        </div>
      </header>

      <section className="report-layout">
        <aside className="panel report-list-panel" aria-label={t("report.resultList")}>
          <div className="chart-card__header">
            <div>
              <h2>{t("report.recentResults")}</h2>
              <p>{t("report.recentResultsHelp")}</p>
            </div>
            <button className="button button-secondary" type="button" onClick={sessionsState.reload}>
              {t("report.refreshResults")}
            </button>
          </div>
          {sessionsState.loading ? <LoadingState label={t("report.loadingSessions")} /> : null}
          {sessionsState.error !== null ? <ApiErrorView error={sessionsState.error} /> : null}
          {!sessionsState.loading && sessions.length === 0 ? (
            <EmptyState title={t("report.noResults")} message={t("report.noResultsMessage")} />
          ) : (
            <div className="report-result-list" role="list">
              {sessions.map((session) => (
                <button
                  className={
                    session.id === activeSessionId
                      ? "report-result-item is-selected"
                      : "report-result-item"
                  }
                  key={session.id}
                  type="button"
                  onClick={() => handleSelectSession(session.id)}
                >
                  <span className="report-result-item__title">{session.name}</span>
                  <span className="report-result-item__meta">
                    {getPlatformName(session)} · {getTargetName(session)}
                  </span>
                  <span className="badge-row">
                    <span className="status-pill">{statusLabel(session.status)}</span>
                    <span className="status-pill">{formatTimestamp(session.startedAt)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </aside>

        <main className="report-detail-stack">
          {details.loading ? <LoadingState label={t("report.loading")} /> : null}
          {details.error !== null ? <ApiErrorView error={normalizeApiError(details.error)} /> : null}
          {exportError !== null ? <ApiErrorView error={exportError} /> : null}
          {activeSessionId.length === 0 && !sessionsState.loading ? (
            <EmptyState title={t("report.noResults")} message={t("report.noResultsMessage")} />
          ) : null}

          {summary !== undefined ? (
            <>
              <section className="panel report-hero-panel">
                <div>
                  <span className="eyebrow">{t("report.selectedResult")}</span>
                  <h2>{sessionTitle}</h2>
                  <p>{getPlatformName(sessionForHeader)} · {getTargetName(sessionForHeader)}</p>
                </div>
                <div className="summary-row">
                  <span className="status-pill">
                    {t("common.status")}:{" "}
                    {statusLabel(sessionForHeader?.status)}
                  </span>
                  <span className="status-pill">
                    {t("report.startedAt")}: {formatTimestamp(startedAt)}
                  </span>
                  <span className="status-pill">
                    {t("report.endedAt")}: {formatTimestamp(endedAt)}
                  </span>
                  <span className="status-pill">
                    {t("report.testDuration")}: {formatDuration(displayDuration)}
                  </span>
                  <span className="status-pill">
                    {t("report.rawMetrics")}: {details.report?.rawMetricCount ?? t("common.na")}
                  </span>
                  <span className="status-pill">
                    {t("tools.diagnostics")}: {diagnosticsCount}
                  </span>
                </div>
              </section>

              <section className="panel">
                <div>
                  <h2>{t("report.coreMetrics")}</h2>
                  <p>{t("report.coreMetricsHelp")}</p>
                </div>
                <div className="metric-grid">
                  <MetricCard title={t("report.avgFps")} value={summary.avgFps} unit="fps" />
                  <MetricCard title={t("report.onePercentLow")} value={summary.onePercentLowFps} unit="fps" />
                  <MetricCard title={t("report.p95FrameTime")} value={summary.p95FrameTimeMs} unit="ms" />
                  <MetricCard title={t("report.avgCpu")} value={summary.avgCpuPercent} unit="%" />
                  <MetricCard title={t("report.avgMemory")} value={summary.avgMemoryMb} unit="MB" />
                  <MetricCard title={t("report.batteryDrain")} value={summary.batteryDrainPercent} unit="%" />
                  <MetricCard title={t("report.networkRx")} value={summary.networkRxMb} unit="MB" />
                  <MetricCard title={t("report.networkTx")} value={summary.networkTxMb} unit="MB" />
                </div>
              </section>

              <ReportTrendPanel
                metrics={details.metrics}
                downsampledBuckets={details.downsampledBuckets}
                metricPreview={details.metricPreview}
              />

              <section className="panel">
                <div>
                  <h2>{t("report.exports")}</h2>
                  <p>
                    {t("report.exportHelp", {
                      duration: formatDuration(summary.durationMs),
                      metrics: details.report?.rawMetricCount ?? 0
                    })}
                  </p>
                </div>
                <ExportButtons onExport={handleExport} />
              </section>
            </>
          ) : null}
        </main>
      </section>
    </div>
  );
}
