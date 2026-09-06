import { useEffect, useMemo, useState } from "react";
import {
  getAndroidHealth,
  getCapabilities,
  getPcPresentMonStatus,
  getToolsStatus,
  refreshAndroidCache,
  startAndroidApp,
  stopAndroidApp
} from "../../api/endpoints";
import { normalizeApiError, type ApiError } from "../../api/errors";
import { ApiErrorView } from "../../components/ApiErrorView";
import { AvailabilityBadge } from "../../components/AvailabilityBadge";
import { AndroidCommandStatusTable } from "../../components/AndroidCommandStatusTable";
import { EmptyState } from "../../components/EmptyState";
import { LoadingState } from "../../components/LoadingState";
import { PcSourcePrecisionNotice } from "../../components/PcSourcePrecisionNotice";
import { PresentMonPermissionNotice } from "../../components/PresentMonPermissionNotice";
import { useAsync } from "../../hooks/useAsync";
import { useDevices } from "../../hooks/useDevices";
import { useTargets } from "../../hooks/useTargets";
import { getQueryParam } from "../../app/routes";
import { useI18n } from "../../i18n/I18nProvider";
import { visibleUserDevices } from "../../utils/devices";

function sanitizeExecutablePath(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    return "N/A";
  }
  return value
    .replace(/[A-Z]:\\Users\\[^\\]+\\/gi, "C:\\Users\\<user>\\")
    .replace(/\/Users\/[^/]+\//g, "/Users/<user>/")
    .replace(/\/home\/[^/]+\//g, "/home/<user>/");
}

export function DeviceDetailPage() {
  const { t } = useI18n();
  const devicesState = useDevices();
  const initialDeviceId = getQueryParam("deviceId");
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(initialDeviceId);
  const [lifecycleError, setLifecycleError] = useState<ApiError | null>(null);
  const [lifecycleMessage, setLifecycleMessage] = useState<string | null>(null);
  const [busyPackage, setBusyPackage] = useState<string | null>(null);
  const [targetFilter, setTargetFilter] = useState("");
  const visibleDevices = useMemo(() => visibleUserDevices(devicesState.data), [devicesState.data]);

  useEffect(() => {
    if (visibleDevices.length === 0) {
      return;
    }
    const selectedStillVisible =
      selectedDeviceId !== null && visibleDevices.some((device) => device.id === selectedDeviceId);
    if (!selectedStillVisible) {
      setSelectedDeviceId(visibleDevices[0]?.id ?? null);
    }
  }, [selectedDeviceId, visibleDevices]);

  const selectedDevice = useMemo(
    () => visibleDevices.find((device) => device.id === selectedDeviceId) ?? null,
    [selectedDeviceId, visibleDevices]
  );
  const targetsState = useTargets(selectedDeviceId);
  const capabilitiesState = useAsync(() => getCapabilities(selectedDevice?.platform), [
    selectedDevice?.platform
  ]);
  const androidHealthState = useAsync(
    () =>
      selectedDevice?.platform === "android" && selectedDeviceId !== null
        ? getAndroidHealth(selectedDeviceId)
        : Promise.resolve(null),
    [selectedDevice?.platform, selectedDeviceId]
  );
  const pcToolsState = useAsync(
    () => (selectedDevice?.platform === "windows" ? getToolsStatus() : Promise.resolve([])),
    [selectedDevice?.platform]
  );
  const pcPresentMonState = useAsync(
    () =>
      selectedDevice?.platform === "windows" && selectedDeviceId !== null
        ? getPcPresentMonStatus(selectedDeviceId)
        : Promise.resolve(null),
    [selectedDevice?.platform, selectedDeviceId]
  );
  const filteredTargets = useMemo(() => {
    const targets = targetsState.data ?? [];
    const normalized = targetFilter.trim().toLowerCase();
    if (normalized.length === 0) {
      return targets;
    }
    return targets.filter((target) => {
      const processName = typeof target.tags?.processName === "string" ? target.tags.processName : "";
      return (
        target.name.toLowerCase().includes(normalized) ||
        processName.toLowerCase().includes(normalized) ||
        String(target.pid ?? "").includes(normalized)
      );
    });
  }, [targetFilter, targetsState.data]);
  const presentMonStatus = pcToolsState.data?.find((tool) => tool.toolName.toLowerCase() === "presentmon");

  async function handleStartApp(packageName: string, launcherComponent?: string): Promise<void> {
    if (selectedDeviceId === null) {
      return;
    }
    setBusyPackage(packageName);
    setLifecycleError(null);
    setLifecycleMessage(null);
    try {
      const result = await startAndroidApp(selectedDeviceId, packageName, {
        ...(launcherComponent === undefined ? {} : { launcherComponent }),
        allowMonkeyFallback: false,
        waitForPid: true
      });
      setLifecycleMessage(
        result.ok
          ? t("device.startCompleted", { method: result.method, pid: result.pid ?? t("common.na") })
          : t("device.startFailed", { reason: result.warnings.join("; ") })
      );
    } catch (error) {
      setLifecycleError(normalizeApiError(error));
    } finally {
      setBusyPackage(null);
    }
  }

  async function handleStopApp(packageName: string): Promise<void> {
    if (selectedDeviceId === null) {
      return;
    }
    const confirmed = window.confirm(t("device.forceStopConfirm"));
    if (!confirmed) {
      return;
    }
    setBusyPackage(packageName);
    setLifecycleError(null);
    setLifecycleMessage(null);
    try {
      const result = await stopAndroidApp(selectedDeviceId, packageName, {
        waitUntilStopped: true
      });
      setLifecycleMessage(
        result.ok
          ? t("device.stopCompleted")
          : t("device.stopFailed", { reason: result.warnings.join("; ") })
      );
    } catch (error) {
      setLifecycleError(normalizeApiError(error));
    } finally {
      setBusyPackage(null);
    }
  }

  async function handleRefreshAndroidCache(): Promise<void> {
    if (selectedDeviceId === null) {
      return;
    }
    setLifecycleError(null);
    setLifecycleMessage(null);
    try {
      await refreshAndroidCache(selectedDeviceId);
      setLifecycleMessage(t("device.cacheRefreshed"));
    } catch (error) {
      setLifecycleError(normalizeApiError(error));
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>{t("device.title")}</h1>
          <p>{t("device.subtitle")}</p>
        </div>
      </header>

      {devicesState.loading ? <LoadingState label={t("dashboard.loadingDevices")} /> : null}
      {devicesState.error !== null ? <ApiErrorView error={devicesState.error} /> : null}

      <section className="panel">
        <label>
          {t("common.device")}
          <select
            value={selectedDeviceId ?? ""}
            onChange={(event) => setSelectedDeviceId(event.target.value)}
          >
            {visibleDevices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
              </option>
            ))}
          </select>
        </label>
        {selectedDevice !== null ? (
          <dl className="detail-list">
            <div>
              <dt>{t("common.platform")}</dt>
              <dd>{selectedDevice.platform}</dd>
            </div>
            <div>
              <dt>{t("common.connection")}</dt>
              <dd>{selectedDevice.connectionType}</dd>
            </div>
            <div>
              <dt>{t("common.os")}</dt>
              <dd>{selectedDevice.osVersion ?? t("common.na")}</dd>
            </div>
          </dl>
        ) : null}
        {selectedDevice?.platform === "android" ? (
          <>
            <p>{t("device.androidHelp")}</p>
            <button className="button button-secondary" type="button" onClick={() => void handleRefreshAndroidCache()}>
              {t("device.refreshAndroidCache")}
            </button>
          </>
        ) : null}
        {selectedDevice?.platform === "windows" ? (
          <p>{t("device.pcHelp")}</p>
        ) : null}
        {selectedDevice?.platform === "windows" && presentMonStatus !== undefined ? (
          <p className="notice-text">
            PresentMon: {presentMonStatus.status}
            {presentMonStatus.version === undefined ? "" : ` (${presentMonStatus.version})`} -{" "}
            {presentMonStatus.reason ?? t("presentMon.defaultReason")}
          </p>
        ) : null}
        {selectedDevice?.platform === "windows" ? (
          <>
            <PcSourcePrecisionNotice />
            <PresentMonPermissionNotice active />
            {pcPresentMonState.data !== null ? (
              <div className="summary-row">
                <span className="status-pill">
                  {t("tools.timedCapture")}:{" "}
                  {pcPresentMonState.data.compatibility?.supportsTimedCapture === true ? t("common.yes") : t("common.na")}
                </span>
                <span className="status-pill">
                  {t("tools.outputFile")}:{" "}
                  {pcPresentMonState.data.compatibility?.supportsOutputFile === true ? t("common.yes") : t("common.na")}
                </span>
                <span className="status-pill">
                  {t("tools.pidFilter")}:{" "}
                  {pcPresentMonState.data.compatibility?.supportsProcessIdFilter === true ? t("common.yes") : t("tools.pidFallback")}
                </span>
              </div>
            ) : null}
          </>
        ) : null}
        {lifecycleError !== null ? <ApiErrorView error={lifecycleError} /> : null}
        {lifecycleMessage !== null ? <p className="notice-text">{lifecycleMessage}</p> : null}
      </section>

      {androidHealthState.data !== null ? <AndroidCommandStatusTable health={androidHealthState.data} /> : null}

      <section className="panel">
        <h2>{t("device.targets")}</h2>
        {selectedDevice?.platform === "windows" ? (
          <label className="filter-control">
            {t("device.searchProcesses")}
            <input
              value={targetFilter}
              placeholder={t("device.processPlaceholder")}
              onChange={(event) => setTargetFilter(event.target.value)}
            />
          </label>
        ) : null}
        {targetsState.loading ? <LoadingState label={t("device.loadingTargets")} /> : null}
        {targetsState.error !== null ? <ApiErrorView error={targetsState.error} /> : null}
        {targetsState.data !== null && targetsState.data.length === 0 ? (
          <EmptyState title={t("device.noTargets")} />
        ) : null}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("common.name")}</th>
                <th>{t("common.type")}</th>
                <th>{t("common.pid")}</th>
                {selectedDevice?.platform === "windows" ? <th>{t("device.executablePath")}</th> : null}
                <th>{t("common.launcher")}</th>
                <th>{t("common.action")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredTargets.map((target) => (
                <tr key={target.id}>
                  <td>{target.name}</td>
                  <td>{target.type}</td>
                   <td>{target.pid ?? t("common.na")}</td>
                  {selectedDevice?.platform === "windows" ? (
                    <td>{sanitizeExecutablePath(target.executablePath)}</td>
                  ) : null}
                   <td>{typeof target.tags?.launcherComponent === "string" ? target.tags.launcherComponent : t("common.na")}</td>
                  <td>
                    <a
                      className="button button-secondary"
                      href={`/session?deviceId=${selectedDeviceId ?? ""}&targetId=${target.id}`}
                    >
                      {selectedDevice?.platform === "android" ? t("device.openSession") : t("device.startTest")}
                    </a>
                    {selectedDevice?.platform === "android" && target.packageName !== undefined ? (
                      <>
                        <button
                          className="button button-secondary"
                          disabled={busyPackage === target.packageName}
                          type="button"
                          onClick={() =>
                            void handleStartApp(
                              target.packageName!,
                              typeof target.tags?.launcherComponent === "string"
                                ? target.tags.launcherComponent
                                : undefined
                            )
                          }
                        >
                          {t("device.startApp")}
                        </button>
                        <button
                          className="button button-secondary"
                          disabled={busyPackage === target.packageName}
                          type="button"
                          onClick={() => void handleStopApp(target.packageName!)}
                        >
                          {t("device.stopApp")}
                        </button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>{t("device.metricAvailability")}</h2>
        {capabilitiesState.loading ? <LoadingState label={t("device.loadingCapabilities")} /> : null}
        {capabilitiesState.error !== null ? <ApiErrorView error={capabilitiesState.error} /> : null}
        <div className="badge-row">
          {capabilitiesState.data?.map((availability) => (
            <AvailabilityBadge
              key={`${availability.platform}-${availability.metricName}-${availability.status}`}
              availability={availability}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
