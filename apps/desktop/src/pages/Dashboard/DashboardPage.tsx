import { useMemo } from "react";
import { ApiErrorView } from "../../components/ApiErrorView";
import { BeginnerGuidePanel } from "../../components/BeginnerGuidePanel";
import { DeviceCard } from "../../components/DeviceCard";
import { EmptyState } from "../../components/EmptyState";
import { LoadingState } from "../../components/LoadingState";
import { SessionHistoryList } from "../../components/SessionHistoryList";
import { SidecarStatusBadge } from "../../components/SidecarStatusBadge";
import { ToastList } from "../../components/Toast";
import { getPackagedStatus, health } from "../../api/endpoints";
import { navigateTo } from "../../app/routes";
import { useAsync } from "../../hooks/useAsync";
import { useDevices } from "../../hooks/useDevices";
import { useSessionHistory } from "../../hooks/useSessionHistory";
import { useToasts } from "../../hooks/useToasts";
import { useI18n } from "../../i18n/I18nProvider";
import { saveLastSession } from "../../state/sessionPersistence";
import { getSidecarStatus } from "../../tauri/sidecarStatus";
import { visibleUserDevices } from "../../utils/devices";

function coerceProfileName(value: string | undefined): "stable_60fps" | "janky_game" | "memory_growth" {
  if (value === "stable_60fps" || value === "memory_growth") {
    return value;
  }
  return "janky_game";
}

export function DashboardPage() {
  const { t } = useI18n();
  const healthState = useAsync(() => health(), []);
  const packagedState = useAsync(() => getPackagedStatus(), []);
  const sidecarState = useAsync(() => getSidecarStatus(), []);
  const devicesState = useDevices();
  const history = useSessionHistory(20);
  const toasts = useToasts();
  const visibleDevices = useMemo(() => visibleUserDevices(devicesState.data), [devicesState.data]);

  async function handleCopy(sessionId: string): Promise<void> {
    try {
      await navigator.clipboard?.writeText(sessionId);
      toasts.showToast(t("dashboard.sessionCopied"), "success");
    } catch {
      toasts.showToast(t("dashboard.sessionCopyFailed"), "error");
    }
  }

  return (
    <div className="page">
      <ToastList toasts={toasts.toasts} onDismiss={toasts.dismissToast} />
      <header className="page-header">
        <div>
          <h1>{t("dashboard.title")}</h1>
          <p>{t("dashboard.subtitle")}</p>
        </div>
      </header>

      {healthState.error !== null ? <ApiErrorView error={healthState.error} /> : null}

      <BeginnerGuidePanel />

      <section className="panel">
        <h2>{t("dashboard.localServer")}</h2>
        {healthState.loading ? <LoadingState label={t("dashboard.checkingServer")} /> : null}
        {healthState.data !== null ? (
          <div className="summary-row">
            <span className="status-pill">
              {t("common.status")}: {healthState.data.status}
            </span>
            <span className="status-pill">
              {t("common.version")}: {healthState.data.version}
            </span>
            <span className="status-pill">
              {t("common.uptime")}: {Math.round(healthState.data.uptimeMs)} ms
            </span>
            {packagedState.data !== null ? (
              <span className="status-pill">
                {t("common.mode")}: {packagedState.data.packaged ? t("common.packaged") : t("common.dev")}
              </span>
            ) : null}
            <SidecarStatusBadge status={sidecarState.data} />
          </div>
        ) : null}
        {packagedState.error !== null ? (
          <p className="notice-text">{t("dashboard.packagedUnavailable")}</p>
        ) : null}
      </section>

      <section className="panel">
        <h2>{t("dashboard.devices")}</h2>
        {devicesState.loading ? <LoadingState label={t("dashboard.loadingDevices")} /> : null}
        {devicesState.error !== null ? <ApiErrorView error={devicesState.error} /> : null}
        {devicesState.data !== null && visibleDevices.length === 0 ? (
          <EmptyState
            title={t("dashboard.noDevices")}
            message={t("dashboard.noDevicesMessage")}
          />
        ) : null}
        <div className="card-grid">
          {visibleDevices.map((device) => (
            <DeviceCard key={device.id} device={device} href={`/devices?deviceId=${device.id}`} />
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>{t("dashboard.recentSessions")}</h2>
        <p>{t("dashboard.recentSessionsHelp")}</p>
        {history.loading ? <LoadingState label={t("dashboard.loadingSessions")} /> : null}
        <SessionHistoryList
          items={history.items}
          localOnly={history.localOnly}
          onCopy={handleCopy}
          onResume={(item) => {
            saveLastSession({
              lastSessionId: item.sessionId,
              deviceId: item.deviceId,
              targetId: item.targetId,
              sessionName: item.name,
              profileName: coerceProfileName(item.profileName),
              sampleIntervalMs: 100,
              lastKnownStatus: item.status,
              updatedAt: Date.now()
            });
            navigateTo(`/session?sessionId=${encodeURIComponent(item.sessionId)}`);
          }}
        />
      </section>
    </div>
  );
}
