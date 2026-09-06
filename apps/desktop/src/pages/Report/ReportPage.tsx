import { useEffect, useMemo, useState } from "react";
import {
  deleteSession as deleteSessionRequest,
  deleteSessions as deleteSessionsRequest,
  exportSession,
  getSessions
} from "../../api/endpoints";
import type { ExportFormat, MetricEvent, Session } from "../../api/types";
import { getQueryParam, navigateTo } from "../../app/routes";
import { ApiErrorView } from "../../components/ApiErrorView";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EmptyState } from "../../components/EmptyState";
import { ExportButtons } from "../../components/ExportButtons";
import { LoadingState } from "../../components/LoadingState";
import { MetricCard } from "../../components/MetricCard";
import { PlatformGlyph, type PlatformGlyphPlatform } from "../../components/PlatformGlyph";
import { ReportTrendPanel } from "../../components/ReportTrendPanel";
import { useReportDetails } from "../../hooks/useReportDetails";
import { useAsync } from "../../hooks/useAsync";
import { useI18n } from "../../i18n/I18nProvider";
import { buildReportLocalization } from "../../i18n/reportLocalization";
import { normalizeApiError } from "../../api/errors";
import type { ApiError } from "../../api/errors";
import {
  loadSessionHistory,
  removeSessionHistoryEntries
} from "../../state/sessionHistoryPersistence";
import { downloadTextFile } from "../../utils/download";
import { formatDuration } from "../../utils/format";

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
  if (deviceId.includes("pc") || deviceId.includes("windows")) {
    return "Windows";
  }
  return "Local";
}

function getPlatformGlyph(session: { deviceId?: unknown } | null): PlatformGlyphPlatform {
  const platform = getPlatformName(session);
  if (platform === "Android") {
    return "android";
  }
  return "windows";
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

function readableTargetName(value: string): string {
  if (/^t\d+$/i.test(value)) {
    return "";
  }
  if (value.startsWith("android-package:")) {
    return value.slice("android-package:".length);
  }
  if (value.startsWith("pc-windows-process:") || value.startsWith("pc-process:")) {
    return "";
  }
  return value;
}

function isGenericSessionName(value: string): boolean {
  return /^MVP-[A-Z]\b/i.test(value) || /^Session\s+/i.test(value);
}

function resultDisplayName(session: Session | null, cachedTargetName?: string): string {
  if (session === null) {
    return "";
  }
  const targetName = readableTargetName(cachedTargetName ?? getTargetName(session));
  if (targetName.length > 0) {
    return targetName;
  }
  if (!isGenericSessionName(session.name)) {
    return session.name;
  }
  return getPlatformName(session);
}

function compactResultName(value: string): string {
  if (!/^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+){2,}$/i.test(value)) {
    return value;
  }
  const packageSuffix = value.split(".").at(-1) ?? value;
  if (packageSuffix.length <= 6) {
    return packageSuffix.toUpperCase();
  }
  return `${packageSuffix.charAt(0).toUpperCase()}${packageSuffix.slice(1)}`;
}

function formatSessionTimestamp(timestampMs: number | undefined, locale: string): string {
  if (timestampMs === undefined) {
    return "N/A";
  }
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestampMs));
}

interface ReportMetricQuality {
  source?: string;
  precision?: string;
  confidence?: string;
  availability: "available" | "unavailable" | "experimental";
}

function getReportMetricQuality(
  metrics: MetricEvent[],
  metricNames: string[],
  value: number | null | undefined
): ReportMetricQuality {
  const sample = metrics.find((metric) => metricNames.includes(metric.metricName));
  const quality: ReportMetricQuality = {
    availability:
      value === null || value === undefined || Number.isNaN(value)
        ? "unavailable"
        : sample?.tags?.experimental === true
          ? "experimental"
          : "available"
  };
  if (sample !== undefined) {
    quality.source = sample.source;
    quality.precision = sample.precision;
    quality.confidence = sample.confidence;
  }
  return quality;
}

function writeReportRoute(sessionId: string): void {
  const url = new URL(window.location.href);
  url.pathname = "/report";
  if (sessionId.length > 0) {
    url.searchParams.set("sessionId", sessionId);
  } else {
    url.searchParams.delete("sessionId");
  }
  window.history.replaceState({}, "", url.pathname + url.search);
}

function TrashGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17">
      <path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" />
    </svg>
  );
}

type PendingDelete = { kind: "all" } | { kind: "single"; session: Session };

export function ReportPage() {
  const { locale, t } = useI18n();
  const initialSessionId = getQueryParam("sessionId") ?? "";
  const [activeSessionId, setActiveSessionId] = useState(initialSessionId);
  const [exportError, setExportError] = useState<ApiError | null>(null);
  const [deleteError, setDeleteError] = useState<ApiError | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [locallyDeletedIds, setLocallyDeletedIds] = useState<Set<string>>(() => new Set());
  const sessionsState = useAsync(() => getSessions({ limit: 50 }), []);
  const sessionData = Array.isArray(sessionsState.data) ? sessionsState.data : [];
  const sessions = useMemo(
    () =>
      sessionData
        .filter((session) => !locallyDeletedIds.has(session.id))
        .sort((a, b) => sessionSortTime(b) - sessionSortTime(a)),
    [locallyDeletedIds, sessionData]
  );
  const cachedTargetNames = useMemo(
    () =>
      new Map(
        loadSessionHistory()
          .filter((entry) => entry.targetName !== undefined)
          .map((entry) => [entry.sessionId, entry.targetName ?? ""])
      ),
    [sessions]
  );
  const selectedSession = sessions.find((session) => session.id === activeSessionId) ?? null;
  const deletableSessions = sessions.filter(
    (session) => session.status !== "running" && session.status !== "paused"
  );
  const details = useReportDetails(activeSessionId);
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
      downloadTextFile(
        await exportSession(
          activeSessionId,
          format,
          format === "html" ? buildReportLocalization(locale, t) : undefined
        ),
        format,
        activeSessionId
      );
    } catch (caught) {
      setExportError(normalizeApiError(caught));
    }
  }

  function handleSelectSession(sessionId: string): void {
    setActiveSessionId(sessionId);
    writeReportRoute(sessionId);
  }

  async function handleConfirmDelete(): Promise<void> {
    if (pendingDelete === null || deleting) {
      return;
    }

    setDeleting(true);
    setDeleteError(null);
    try {
      let removedIds: string[];
      if (pendingDelete.kind === "single") {
        await deleteSessionRequest(pendingDelete.session.id);
        removedIds = [pendingDelete.session.id];
      } else {
        const result = await deleteSessionsRequest();
        const skippedIds = new Set(result.skippedSessionIds);
        removedIds = sessions
          .filter((session) => !skippedIds.has(session.id))
          .map((session) => session.id);
      }

      const removedIdSet = new Set(removedIds);
      setLocallyDeletedIds((current) => new Set([...current, ...removedIds]));
      removeSessionHistoryEntries(removedIds);

      if (removedIdSet.has(activeSessionId)) {
        const nextSessionId = sessions.find((session) => !removedIdSet.has(session.id))?.id ?? "";
        setActiveSessionId(nextSessionId);
        writeReportRoute(nextSessionId);
      }
      setPendingDelete(null);
      sessionsState.reload();
    } catch (caught) {
      setDeleteError(normalizeApiError(caught));
    } finally {
      setDeleting(false);
    }
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
  const sessionTitle = resultDisplayName(
    sessionForHeader,
    sessionForHeader === null ? undefined : cachedTargetNames.get(sessionForHeader.id)
  );
  const compactSessionTitle = compactResultName(sessionTitle);
  const sessionIdentifier = compactSessionTitle === sessionTitle ? "" : sessionTitle;
  const startedAt = sessionForHeader?.startedAt;
  const endedAt = sessionForHeader?.endedAt;
  const displayDuration =
    summary?.durationMs ??
    (startedAt !== undefined && endedAt !== undefined ? endedAt - startedAt : undefined);
  const showEmptyReport =
    !sessionsState.loading && sessionsState.error === null && sessions.length === 0;
  const metricValues = summary === undefined
    ? []
    : [
        summary.avgFps,
        summary.onePercentLowFps,
        summary.p95FrameTimeMs,
        summary.avgCpuPercent,
        summary.avgGpuPercent,
        summary.avgMemoryMb,
        summary.avgPowerW,
        summary.peakGpuTemperatureC,
        summary.batteryDrainPercent,
        summary.networkRxMb,
        summary.networkTxMb
      ];
  const collectedMetricCount = metricValues.filter(
    (value) => value !== null && value !== undefined && !Number.isNaN(value)
  ).length;
  const missingMetricCount = metricValues.length - collectedMetricCount;
  const reportMetricProps = (metricNames: string[], value: number | null | undefined) => ({
    ...getReportMetricQuality(details.metrics, metricNames, value),
    metadataMode: "details" as const,
    missingValueLabel: t("report.notCollected")
  });

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>{t("report.title")}</h1>
          <p>{t("report.subtitle")}</p>
        </div>
      </header>

      <section className={showEmptyReport ? "report-layout report-layout--empty" : "report-layout"}>
        <aside className="panel report-list-panel" aria-label={t("report.resultList")}>
          {!showEmptyReport ? (
            <div className="report-list-panel__header">
              <div className="report-list-panel__title">
                <h2>{t("report.testRecords")}</h2>
                <span className="report-list-panel__count">
                  {t("report.resultCount", { count: sessions.length })}
                </span>
              </div>
              <button
                className="report-clear-button"
                type="button"
                disabled={deletableSessions.length === 0 || deleting}
                onClick={() => setPendingDelete({ kind: "all" })}
              >
                <TrashGlyph />
                <span>{t("report.deleteAll")}</span>
              </button>
            </div>
          ) : null}
          {sessionsState.loading ? <LoadingState label={t("report.loadingSessions")} /> : null}
          {sessionsState.error !== null ? <ApiErrorView error={sessionsState.error} /> : null}
          {showEmptyReport ? (
            <div className="report-empty-panel">
              <span className="eyebrow">{t("report.emptyEyebrow")}</span>
              <EmptyState title={t("report.noResults")} message={t("report.noResultsMessage")} />
              <button
                className="button button-primary"
                type="button"
                onClick={() => navigateTo("/session")}
              >
                {t("report.startFirstTest")}
              </button>
            </div>
          ) : (
            <div className="report-result-list" role="list">
              {sessions.map((session) => {
                const fullName = resultDisplayName(session, cachedTargetNames.get(session.id));
                const displayName = compactResultName(fullName);
                const duration =
                  session.startedAt !== undefined && session.endedAt !== undefined
                    ? session.endedAt - session.startedAt
                    : undefined;
                const canDelete = session.status !== "running" && session.status !== "paused";
                return (
                  <div
                    className={
                      session.id === activeSessionId
                        ? "report-result-item is-selected"
                        : "report-result-item"
                    }
                    key={session.id}
                  >
                    <button
                      className="report-result-item__select"
                      type="button"
                      aria-current={session.id === activeSessionId ? "true" : undefined}
                      onClick={() => handleSelectSession(session.id)}
                    >
                      <span
                        className={`report-result-item__icon report-result-item__icon--${getPlatformGlyph(session)}`}
                      >
                        <PlatformGlyph platform={getPlatformGlyph(session)} size={27} />
                      </span>
                      <span className="report-result-item__copy">
                        <span className="report-result-item__title">{displayName}</span>
                        {displayName !== fullName ? (
                          <span className="report-result-item__identifier">{fullName}</span>
                        ) : null}
                        <span className="report-result-item__meta">
                          {getPlatformName(session)} · {formatSessionTimestamp(session.startedAt, locale)}
                        </span>
                      </span>
                      <span className="report-result-item__footer">
                        <span className="status-pill">{statusLabel(session.status)}</span>
                        <span>{formatDuration(duration)}</span>
                      </span>
                    </button>
                    {canDelete ? (
                      <button
                        className="report-result-item__delete"
                        type="button"
                        disabled={deleting}
                        aria-label={t("report.deleteOneAria", { name: displayName })}
                        title={t("report.deleteOne")}
                        onClick={() => setPendingDelete({ kind: "single", session })}
                      >
                        <TrashGlyph />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </aside>

        <main className="report-detail-stack" hidden={showEmptyReport}>
          {details.loading ? <LoadingState label={t("report.loading")} /> : null}
          {details.error !== null ? (
            <ApiErrorView error={normalizeApiError(details.error)} />
          ) : null}
          {exportError !== null ? <ApiErrorView error={exportError} /> : null}
          {deleteError !== null ? <ApiErrorView error={deleteError} /> : null}
          {summary !== undefined ? (
            <>
              <section className="panel report-overview-panel">
                <div className="report-overview-panel__heading">
                  <span
                    className={`report-overview-panel__icon report-overview-panel__icon--${getPlatformGlyph(sessionForHeader)}`}
                  >
                    <PlatformGlyph platform={getPlatformGlyph(sessionForHeader)} size={34} />
                  </span>
                  <div>
                    <span className="eyebrow">{t("report.overview")}</span>
                    <h2>{compactSessionTitle}</h2>
                    {sessionIdentifier.length > 0 ? (
                      <p className="report-overview-panel__identifier">{sessionIdentifier}</p>
                    ) : null}
                  </div>
                  <span className="status-pill report-overview-panel__status">
                    {statusLabel(sessionForHeader?.status)}
                  </span>
                </div>
                <div className="report-overview-panel__facts">
                  <div>
                    <span>{t("common.platform")}</span>
                    <strong>{getPlatformName(sessionForHeader)}</strong>
                  </div>
                  <div>
                    <span>{t("report.startedAt")}</span>
                    <strong>{formatSessionTimestamp(startedAt, locale)}</strong>
                  </div>
                  <div>
                    <span>{t("report.testDuration")}</span>
                    <strong>{formatDuration(displayDuration)}</strong>
                  </div>
                  <div>
                    <span>{t("report.samples")}</span>
                    <strong>{details.report?.rawMetricCount ?? t("common.na")}</strong>
                  </div>
                </div>
                <div className="report-overview-panel__coverage">
                  <span className="report-overview-panel__coverage-dot" aria-hidden="true" />
                  {t("report.collectedSummary", {
                    available: collectedMetricCount,
                    unavailable: missingMetricCount
                  })}
                </div>
              </section>

              <section className="panel report-metrics-panel report-metrics-panel--performance">
                <div className="report-section-heading">
                  <div>
                    <span className="eyebrow">{t("report.coreMetrics")}</span>
                    <h2>{t("report.performanceGroup")}</h2>
                    <p>{t("report.performanceGroupHelp")}</p>
                  </div>
                </div>
                <div className="metric-grid report-metric-grid report-metric-grid--featured">
                  <MetricCard
                    title={t("report.avgFps")}
                    value={summary.avgFps}
                    unit="fps"
                    icon="FPS"
                    variant="featured"
                    {...reportMetricProps(["fps"], summary.avgFps)}
                  />
                  <MetricCard
                    title={t("report.onePercentLow")}
                    value={summary.onePercentLowFps}
                    unit="fps"
                    icon="1%"
                    variant="featured"
                    {...reportMetricProps(["fps"], summary.onePercentLowFps)}
                  />
                  <MetricCard
                    title={t("report.p95FrameTime")}
                    value={summary.p95FrameTimeMs}
                    unit="ms"
                    icon="ms"
                    variant="featured"
                    {...reportMetricProps(["frame_time_ms"], summary.p95FrameTimeMs)}
                  />
                </div>
              </section>

              <section className="panel report-metrics-panel">
                <div className="report-section-heading">
                  <div>
                    <h2>{t("report.resourcesGroup")}</h2>
                    <p>{t("report.resourcesGroupHelp")}</p>
                  </div>
                </div>
                <div className="metric-grid report-metric-grid">
                  <MetricCard
                    title={t("report.avgCpu")}
                    value={summary.avgCpuPercent}
                    unit="%"
                    icon="CPU"
                    variant="compact"
                    {...reportMetricProps(["cpu_percent"], summary.avgCpuPercent)}
                  />
                  <MetricCard
                    title={t("metric.gpu")}
                    value={summary.avgGpuPercent}
                    unit="%"
                    icon="GPU"
                    variant="compact"
                    {...reportMetricProps(["gpu_utilization"], summary.avgGpuPercent)}
                  />
                  <MetricCard
                    title={t("report.avgMemory")}
                    value={summary.avgMemoryMb}
                    unit="MB"
                    icon="RAM"
                    variant="compact"
                    {...reportMetricProps(["memory_mb"], summary.avgMemoryMb)}
                  />
                </div>
              </section>

              <section className="panel report-metrics-panel">
                <div className="report-section-heading">
                  <div>
                    <h2>{t("report.deviceGroup")}</h2>
                    <p>{t("report.deviceGroupHelp")}</p>
                  </div>
                </div>
                <div className="metric-grid report-metric-grid report-metric-grid--secondary">
                  <MetricCard
                    title={t("metric.power")}
                    value={summary.avgPowerW}
                    unit="W"
                    icon="W"
                    variant="compact"
                    {...reportMetricProps(["power_w"], summary.avgPowerW)}
                  />
                  <MetricCard
                    title={t("metric.gpuTemperature")}
                    value={summary.peakGpuTemperatureC}
                    unit="°C"
                    icon="°C"
                    variant="compact"
                    {...reportMetricProps(["gpu_temperature_c"], summary.peakGpuTemperatureC)}
                  />
                  <MetricCard
                    title={t("report.batteryDrain")}
                    value={summary.batteryDrainPercent}
                    unit="%"
                    icon="BAT"
                    variant="compact"
                    {...reportMetricProps(["battery_level_percent"], summary.batteryDrainPercent)}
                  />
                  <MetricCard
                    title={t("report.networkRx")}
                    value={summary.networkRxMb}
                    unit="MB"
                    icon="↓"
                    variant="compact"
                    {...reportMetricProps(
                      ["network_rx_bytes", "network_rx_rate_bps", "network_rx_bytes_per_sec"],
                      summary.networkRxMb
                    )}
                  />
                  <MetricCard
                    title={t("report.networkTx")}
                    value={summary.networkTxMb}
                    unit="MB"
                    icon="↑"
                    variant="compact"
                    {...reportMetricProps(
                      ["network_tx_bytes", "network_tx_rate_bps", "network_tx_bytes_per_sec"],
                      summary.networkTxMb
                    )}
                  />
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

      <ConfirmDialog
        open={pendingDelete !== null}
        title={
          pendingDelete?.kind === "single"
            ? t("report.deleteOneTitle")
            : t("report.deleteAllTitle")
        }
        message={
          pendingDelete?.kind === "single"
            ? t("report.deleteOneMessage", {
                name: compactResultName(resultDisplayName(pendingDelete.session))
              })
            : t("report.deleteAllMessage", { count: deletableSessions.length })
        }
        confirmLabel={
          deleting
            ? t("report.deleting")
            : pendingDelete?.kind === "single"
              ? t("report.confirmDelete")
              : t("report.confirmDeleteAll")
        }
        cancelLabel={t("common.cancel")}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => {
          if (!deleting) {
            setPendingDelete(null);
          }
        }}
      />
    </div>
  );
}
