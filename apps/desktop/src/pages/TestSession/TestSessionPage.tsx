import { useEffect, useMemo, useRef, useState } from "react";
import {
  addMarker,
  createSession,
  getAndroidForegroundApp,
  getPackagedStatus,
  getPresentMonCaptureStatus,
  getSession,
  startSession,
  stopSession
} from "../../api/endpoints";
import type { Device, EventMarker, Session, Target } from "../../api/types";
import { getQueryParam } from "../../app/routes";
import { ApiErrorView } from "../../components/ApiErrorView";
import { AndroidFallbackNotice } from "../../components/AndroidFallbackNotice";
import { ConnectionStatusBadge } from "../../components/ConnectionStatusBadge";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EmptyState } from "../../components/EmptyState";
import { EventMarkerPanel } from "../../components/EventMarkerPanel";
import { KeyboardShortcutHelp } from "../../components/KeyboardShortcutHelp";
import { IosTraceImportPanel } from "../../components/IosTraceImportPanel";
import { LoadingState } from "../../components/LoadingState";
import { MarkerTimeline } from "../../components/MarkerTimeline";
import { MetricCard } from "../../components/MetricCard";
import { MetricQualityLegend } from "../../components/MetricQualityLegend";
import { PresentMonCaptureStatusPanel } from "../../components/PresentMonCaptureStatusPanel";
import { PresentMonCsvRetentionPanel } from "../../components/PresentMonCsvRetentionPanel";
import { PresentMonPermissionNotice } from "../../components/PresentMonPermissionNotice";
import { ProcessTargetPicker } from "../../components/ProcessTargetPicker";
import { SessionStatusBadge } from "../../components/SessionStatusBadge";
import { TimeWindowControls } from "../../components/TimeWindowControls";
import { ToastList } from "../../components/Toast";
import { MetricChartPanel } from "../../components/charts/MetricChartPanel";
import { normalizeApiError } from "../../api/errors";
import type { ApiError } from "../../api/errors";
import { useDevices } from "../../hooks/useDevices";
import { useAsync } from "../../hooks/useAsync";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { useLatestMetrics } from "../../hooks/useLatestMetrics";
import { useRealtimeMetricSeries } from "../../hooks/useRealtimeMetricSeries";
import { useReconnectableSessionStream } from "../../hooks/useReconnectableSessionStream";
import { useSessionHistory } from "../../hooks/useSessionHistory";
import { useTargets } from "../../hooks/useTargets";
import { useToasts } from "../../hooks/useToasts";
import { useI18n } from "../../i18n/I18nProvider";
import { chooseReportOutputDirectory, detectTauri, openReportsDirectory } from "../../tauri/tauriClient";
import { formatMetricValue, formatTimestamp } from "../../utils/format";
import { filterSeriesStateByWindow, type MetricWindow } from "../../utils/metricWindow";

const guidedPlatforms = ["windows", "android", "ios"] as const;

type GuidedPlatform = (typeof guidedPlatforms)[number];
type ProfileName = "stable_60fps" | "janky_game" | "memory_growth";
type ProcessMissingPolicy = "pause_process_metrics_keep_device_metrics" | "wait_for_rebind" | "fail_session";
type PresentMonTargetMode = "pid" | "process_name";
type PresentMonRetentionMode = "delete_after_parse" | "keep_until_session_end" | "keep_user_requested";

function isGuidedPlatform(value: string | undefined): value is GuidedPlatform {
  return value === "windows" || value === "android" || value === "ios";
}

function isMockDevice(device: Device): boolean {
  return device.tags?.source === "mock" || device.name.toLowerCase().includes("mock");
}

function findPreferredDevice(devices: Device[] | null | undefined, platform: GuidedPlatform): Device | undefined {
  const matching = devices?.filter((device) => device.platform === platform) ?? [];
  if (platform === "windows") {
    return matching.find((device) => !isMockDevice(device));
  }
  return matching[0];
}

function buildDeviceOptions(
  devices: Device[] | null | undefined,
  platform: GuidedPlatform | null,
  currentDevice: Device | undefined
): Device[] {
  if (platform === null) {
    return [];
  }
  const platformDevices = devices?.filter((device) => device.platform === platform) ?? [];
  if (platform !== "windows") {
    return platformDevices;
  }

  const realDevices = platformDevices.filter((device) => !isMockDevice(device));
  if (currentDevice !== undefined && isMockDevice(currentDevice) && currentDevice.platform === platform) {
    return [currentDevice, ...realDevices.filter((device) => device.id !== currentDevice.id)];
  }
  return realDevices;
}

function targetMatchesSearch(target: Target, search: string): boolean {
  const normalizedSearch = search.trim().toLowerCase();
  if (normalizedSearch.length === 0) {
    return true;
  }
  const tags = target.tags ?? {};
  const searchable = [
    target.name,
    target.id,
    target.packageName,
    target.bundleId,
    target.executablePath,
    target.pid,
    tags.processName,
    tags.runtimeId,
    tags.source
  ]
    .filter((value): value is string | number => typeof value === "string" || typeof value === "number")
    .map((value) => String(value).toLowerCase())
    .join(" ");
  return searchable.includes(normalizedSearch);
}

function targetOptionLabel(target: Target, platform: GuidedPlatform | null): string {
  if (platform !== "windows") {
    return target.name;
  }
  const tags = target.tags ?? {};
  const pid =
    typeof target.pid === "number" || typeof target.pid === "string"
      ? target.pid
      : typeof tags.pid === "number" || typeof tags.pid === "string"
        ? tags.pid
        : undefined;
  const processName = typeof tags.processName === "string" && tags.processName.length > 0 ? tags.processName : target.name;
  return pid === undefined ? processName : `${processName} (PID ${pid})`;
}

export function TestSessionPage() {
  const { t } = useI18n();
  const queryDeviceId = getQueryParam("deviceId");
  const queryTargetId = getQueryParam("targetId");
  const querySessionId = getQueryParam("sessionId");
  const devicesState = useDevices();
  const [deviceId, setDeviceId] = useState(queryDeviceId ?? "");
  const [selectedPlatform, setSelectedPlatform] = useState<GuidedPlatform | null>(null);
  const [targetId, setTargetId] = useState(queryTargetId ?? "");
  const [targetSearch, setTargetSearch] = useState("");
  const [androidForegroundTarget, setAndroidForegroundTarget] = useState<Target | null>(null);
  const currentDevice = devicesState.data?.find((device) => device.id === deviceId);
  const shouldLoadTargets =
    deviceId.length > 0 && currentDevice?.platform !== "android" ? deviceId : null;
  const targetsState = useTargets(shouldLoadTargets);
  const [sessionName, setSessionName] = useState("MVP-B UI Session");
  const [profileName, setProfileName] = useState<ProfileName>("janky_game");
  const [autoStartTarget, setAutoStartTarget] = useState(false);
  const [allowMonkeyFallback, setAllowMonkeyFallback] = useState(false);
  const [stopTargetOnSessionStop, setStopTargetOnSessionStop] = useState(false);
  const [enablePresentMonCapture, setEnablePresentMonCapture] = useState(false);
  const [presentMonCaptureDurationMs, setPresentMonCaptureDurationMs] = useState(10000);
  const [presentMonTargetMode, setPresentMonTargetMode] =
    useState<PresentMonTargetMode>("pid");
  const [keepPresentMonCsv, setKeepPresentMonCsv] = useState(false);
  const [presentMonRetentionMode, setPresentMonRetentionMode] =
    useState<PresentMonRetentionMode>("delete_after_parse");
  const [processMissingPolicy, setProcessMissingPolicy] =
    useState<ProcessMissingPolicy>("pause_process_metrics_keep_device_metrics");
  const [launcherComponent, setLauncherComponent] = useState("");
  const [sampleIntervalMs, setSampleIntervalMs] = useState(100);
  const [session, setSession] = useState<Session | null>(null);
  const [reportOutputRefreshKey, setReportOutputRefreshKey] = useState(0);
  const [reportOutputBusy, setReportOutputBusy] = useState(false);
  const packagedStatusState = useAsync(
    () => (selectedPlatform === null ? Promise.resolve(null) : getPackagedStatus()),
    [selectedPlatform, session?.status, reportOutputRefreshKey]
  );
  const [markers, setMarkers] = useState<EventMarker[]>([]);
  const [busy, setBusy] = useState<"create" | "start" | "stop" | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [confirmStopOpen, setConfirmStopOpen] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [metricsCollapsed, setMetricsCollapsed] = useState(false);
  const [metricWindow, setMetricWindow] = useState<MetricWindow>("all");
  const history = useSessionHistory(20);
  const toasts = useToasts();
  const stream = useReconnectableSessionStream(session?.id ?? null, session?.status === "running");
  const latest = useLatestMetrics(stream.metrics);
  const chartSeries = useRealtimeMetricSeries(1000);
  const markerLabelRef = useRef<HTMLInputElement | null>(null);
  const processedMetricCountRef = useRef(0);
  const fieldsLocked = session?.status === "running";
  const currentTarget =
    targetsState.data?.find((target) => target.id === targetId) ??
    (androidForegroundTarget?.id === targetId ? androidForegroundTarget : undefined);
  const platformDevices = useMemo(
    () =>
      guidedPlatforms.reduce<Record<GuidedPlatform, Device | undefined>>(
        (accumulator, platform) => ({
          ...accumulator,
          [platform]: findPreferredDevice(devicesState.data, platform)
        }),
        {
          windows: undefined,
          android: undefined,
          ios: undefined
        }
      ),
    [devicesState.data]
  );
  const deviceOptions = useMemo(
    () => buildDeviceOptions(devicesState.data, selectedPlatform, currentDevice),
    [currentDevice, devicesState.data, selectedPlatform]
  );
  const isAndroidTarget = currentDevice?.platform === "android";
  const isPcTarget = currentDevice?.platform === "windows";
  const isIosTarget = currentDevice?.platform === "ios";
  const targetOptions = useMemo(
    () =>
      isPcTarget
        ? (targetsState.data ?? []).filter((target) => targetMatchesSearch(target, targetSearch))
        : isAndroidTarget
          ? androidForegroundTarget === null
            ? []
            : [androidForegroundTarget]
        : targetsState.data ?? [],
    [androidForegroundTarget, isAndroidTarget, isPcTarget, targetSearch, targetsState.data]
  );
  const pcFpsAvailability = currentDevice?.capabilities.find((item) => item.metricName === "fps");
  const chartWindowState = filterSeriesStateByWindow(chartSeries.seriesState, metricWindow);
  const latestNetworkMetric = latest.networkRx ?? latest.networkTx ?? latest.networkRxRate ?? latest.networkTxRate;
  const networkScope = latestNetworkMetric?.tags?.scope;
  const latestSource =
    latest.cpu?.source ??
    latest.memory?.source ??
    latest.batteryLevel?.source ??
    latestNetworkMetric?.source ??
    latest.fps?.source;
  const presentMonStatusState = useAsync(
    () =>
      isPcTarget && session !== null
        ? getPresentMonCaptureStatus(session.id)
        : Promise.resolve(null),
    [isPcTarget, session?.id, session?.status, stream.metrics.length]
  );
  const currentPid =
    latest.cpu?.tags?.pid ??
    latest.memory?.tags?.pid ??
    latest.batteryLevel?.tags?.pid ??
    latestNetworkMetric?.tags?.pid;
  const reportOutputDir =
    packagedStatusState.data?.reportsDir ?? packagedStatusState.data?.storage?.reportsDirSanitized ?? null;
  const canOpenReportOutputDir = detectTauri() && reportOutputDir !== null;
  const canChooseReportOutputDir = detectTauri() && !fieldsLocked;

  useEffect(() => {
    if (deviceId.length === 0 && devicesState.data !== null && devicesState.data.length > 0) {
      const firstVisibleDevice = devicesState.data.find((device) => !isMockDevice(device));
      setDeviceId(findPreferredDevice(devicesState.data, "windows")?.id ?? firstVisibleDevice?.id ?? "");
    }
  }, [deviceId, devicesState.data]);

  useEffect(() => {
    if (
      selectedPlatform === null &&
      (queryDeviceId !== null || querySessionId !== null) &&
      isGuidedPlatform(currentDevice?.platform)
    ) {
      setSelectedPlatform(currentDevice.platform);
    }
  }, [currentDevice?.platform, queryDeviceId, querySessionId, selectedPlatform]);

  useEffect(() => {
    if (selectedPlatform === "android") {
      setProcessMissingPolicy((current) =>
        current === "pause_process_metrics_keep_device_metrics" ? "fail_session" : current
      );
    }
  }, [selectedPlatform]);

  useEffect(() => {
    if (selectedPlatform === null || devicesState.data === null) {
      return;
    }
    const currentDeviceMatchesPlatform = devicesState.data.some(
      (device) => device.id === deviceId && device.platform === selectedPlatform
    );
    if (currentDeviceMatchesPlatform) {
      return;
    }
    const preferredDevice = findPreferredDevice(devicesState.data, selectedPlatform);
    if (preferredDevice !== undefined && preferredDevice.id !== deviceId) {
      setDeviceId(preferredDevice.id);
      setTargetId("");
      setAndroidForegroundTarget(null);
      setSession(null);
    }
  }, [deviceId, devicesState.data, selectedPlatform]);

  useEffect(() => {
    if (targetsState.data === null) {
      return;
    }
    if (targetOptions.length === 0) {
      if (isPcTarget && targetSearch.trim().length > 0 && targetId.length > 0) {
        setTargetId("");
      }
      return;
    }
    if (targetId.length === 0 || !targetOptions.some((target) => target.id === targetId)) {
      setTargetId(targetOptions[0]?.id ?? "");
    }
  }, [isPcTarget, targetId, targetOptions, targetSearch, targetsState.data]);

  useEffect(() => {
    if (querySessionId === null || querySessionId.length === 0) {
      return;
    }
    let active = true;
    getSession(querySessionId)
      .then((confirmed) => {
        if (!active) {
          return;
        }
        setSession(confirmed);
        setDeviceId(confirmed.deviceId);
        setTargetId(confirmed.targetId);
        setSessionName(confirmed.name);
        setSampleIntervalMs(confirmed.sampleIntervalMs);
        if (typeof confirmed.config?.profileName === "string") {
          setProfileName(confirmed.config.profileName as ProfileName);
        }
        setAutoStartTarget(confirmed.config?.autoStartTarget === true);
        setAllowMonkeyFallback(confirmed.config?.allowMonkeyFallback === true);
        setStopTargetOnSessionStop(confirmed.config?.stopTargetOnSessionStop === true);
        setEnablePresentMonCapture(confirmed.config?.enablePresentMonCapture === true);
        if (typeof confirmed.config?.presentMonCaptureDurationMs === "number") {
          setPresentMonCaptureDurationMs(confirmed.config.presentMonCaptureDurationMs);
        }
        setPresentMonTargetMode(
          confirmed.config?.presentMonTargetMode === "process_name" ? "process_name" : "pid"
        );
        setKeepPresentMonCsv(confirmed.config?.keepPresentMonCsv === true);
        if (
          confirmed.config?.presentMonRetentionMode === "delete_after_parse" ||
          confirmed.config?.presentMonRetentionMode === "keep_until_session_end" ||
          confirmed.config?.presentMonRetentionMode === "keep_user_requested"
        ) {
          setPresentMonRetentionMode(confirmed.config.presentMonRetentionMode);
        }
        if (
          confirmed.config?.processMissingPolicy === "pause_process_metrics_keep_device_metrics" ||
          confirmed.config?.processMissingPolicy === "wait_for_rebind" ||
          confirmed.config?.processMissingPolicy === "fail_session"
        ) {
          setProcessMissingPolicy(confirmed.config.processMissingPolicy);
        }
        if (typeof confirmed.config?.launcherComponent === "string") {
          setLauncherComponent(confirmed.config.launcherComponent);
        }
      })
      .catch((caught) => {
        if (active) {
          setError(normalizeApiError(caught));
        }
      });
    return () => {
      active = false;
    };
  }, [querySessionId]);

  useEffect(() => {
    const nextEvents = stream.metrics.slice(processedMetricCountRef.current);
    for (const event of nextEvents) {
      chartSeries.append(event);
    }
    processedMetricCountRef.current = stream.metrics.length;
  }, [chartSeries, stream.metrics]);

  function persistSession(nextSession: Session): void {
    history.remember(nextSession, {
      ...(currentTarget?.name === undefined ? {} : { targetName: currentTarget.name }),
      profileName
    });
  }

  useEffect(() => {
    if (!isAndroidTarget || launcherComponent.length > 0) {
      return;
    }
    const targetLauncher =
      typeof currentTarget?.tags?.launcherComponent === "string" ? currentTarget.tags.launcherComponent : "";
    if (targetLauncher.length > 0) {
      setLauncherComponent(targetLauncher);
    }
  }, [currentTarget, isAndroidTarget, launcherComponent.length]);

  async function runAction<T>(kind: "create" | "start" | "stop", action: () => Promise<T>): Promise<T | null> {
    setBusy(kind);
    setError(null);
    try {
      return await action();
    } catch (caught) {
      setError(normalizeApiError(caught));
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function createNewSession(targetIdOverride?: string): Promise<Session | null> {
    const effectiveTargetId = targetIdOverride ?? targetId;
    const created = await runAction("create", () =>
      createSession({
        name: sessionName,
        deviceId,
        targetId: effectiveTargetId,
        sampleIntervalMs,
        config: {
          profileName,
          ...(isAndroidTarget
            ? {
                enableExperimentalFps: true,
                enableRealtimeFps: true,
                fpsSampleIntervalMs: 1000,
                autoStartTarget,
                allowMonkeyFallback,
                stopTargetOnSessionStop,
                processMissingPolicy,
                ...(launcherComponent.length === 0 ? {} : { launcherComponent })
              }
            : {}),
          ...(isPcTarget
            ? {
                enablePresentMonCapture,
                enablePresentMonRealtime: true,
                presentMonCaptureDurationMs,
                presentMonRealtimeChunkMs: 1000,
                presentMonTargetMode,
                keepPresentMonCsv,
                presentMonRetentionMode
              }
            : {})
        }
      })
    );
    if (created !== null) {
      setSession(created);
      persistSession(created);
    }
    return created;
  }

  async function handleStart(): Promise<void> {
    if (session === null) {
      return;
    }
    const started = await runAction("start", () => startSession(session.id));
    if (started !== null) {
      setSession(started);
      persistSession(started);
      toasts.showToast(t("session.started"), "success");
    }
  }

  async function handleGuidedStart(): Promise<void> {
    if (deviceId.length === 0 || session?.status === "running") {
      return;
    }
    let effectiveTargetId = targetId;
    if (isAndroidTarget) {
      const foreground = await runAction("create", () => getAndroidForegroundApp(deviceId));
      if (foreground === null) {
        return;
      }
      setAndroidForegroundTarget(foreground);
      setTargetId(foreground.id);
      effectiveTargetId = foreground.id;
      toasts.showToast(t("session.androidForegroundDetected", { packageName: foreground.packageName ?? foreground.name }), "success");
    } else if (effectiveTargetId.length === 0) {
      return;
    }
    const sessionToStart =
      session !== null && session.status !== "stopped"
        ? session
        : await createNewSession(effectiveTargetId);
    if (sessionToStart === null) {
      return;
    }
    const started = await runAction("start", () => startSession(sessionToStart.id));
    if (started !== null) {
      setSession(started);
      persistSession(started);
      toasts.showToast(t("session.started"), "success");
    }
  }

  function handleSelectPlatform(platform: GuidedPlatform): void {
    setSelectedPlatform(platform);
    setTargetSearch("");
    setTargetId("");
    setAndroidForegroundTarget(null);
    setSession(null);
    if (platform === "android") {
      setProcessMissingPolicy("fail_session");
    }
  }

  async function handleStop(): Promise<void> {
    if (session === null) {
      return;
    }
    const stopped = await runAction("stop", () => stopSession(session.id));
    if (stopped !== null) {
      setSession(stopped);
      persistSession(stopped);
      toasts.showToast(t("session.stopped"), "success");
    }
  }

  async function handleAddMarker(input: { label: string; description?: string }): Promise<EventMarker> {
    if (session === null) {
      throw new Error("Session is required.");
    }
    const marker = await addMarker(session.id, input);
    setMarkers((current) => [marker, ...current]);
    toasts.showToast(t("session.markerAdded"), "success");
    return marker;
  }

  function handleClearChartBuffer(): void {
    chartSeries.clear();
    processedMetricCountRef.current = stream.metrics.length;
  }

  async function handleOpenReportOutputDir(): Promise<void> {
    try {
      await openReportsDirectory();
    } catch {
      toasts.showToast(t("session.reportOutputDirOpenFailed"), "error");
    }
  }

  async function handleChooseReportOutputDir(): Promise<void> {
    setReportOutputBusy(true);
    try {
      const result = await chooseReportOutputDirectory();
      if (result.cancelled) {
        return;
      }
      setReportOutputRefreshKey((current) => current + 1);
      toasts.showToast(t("session.reportOutputDirChanged"), "success");
    } catch {
      toasts.showToast(t("session.reportOutputDirChangeFailed"), "error");
    } finally {
      setReportOutputBusy(false);
    }
  }

  useKeyboardShortcuts({
    onStart: () => {
      if (session !== null && session.status !== "running") {
        void handleStart();
      }
    },
    onStop: () => {
      if (session?.status === "running") {
        setConfirmStopOpen(true);
      }
    },
    onFocusMarker: () => markerLabelRef.current?.focus(),
    onHelp: () => setShortcutHelpOpen(true)
  });

  const selectedPlatformDevice =
    selectedPlatform === null
      ? undefined
      : platformDevices[selectedPlatform] ??
        (currentDevice?.platform === selectedPlatform ? currentDevice : undefined);
  const selectedPlatformSteps =
    selectedPlatform === null
      ? (["session.defaultStep1", "session.defaultStep2", "session.defaultStep3"] as const)
      : selectedPlatform === "android"
      ? (["session.androidStep1", "session.androidStep2", "session.androidStep3"] as const)
      : selectedPlatform === "ios"
        ? (["session.iosStep1", "session.iosStep2", "session.iosStep3"] as const)
        : (["session.windowsStep1", "session.windowsStep2", "session.windowsStep3"] as const);
  const guidedStartDisabled =
    busy !== null ||
    session?.status === "running" ||
    deviceId.length === 0 ||
    (selectedPlatform !== "android" && targetId.length === 0) ||
    selectedPlatformDevice === undefined;
  const hasAnyTargetOptions = (targetsState.data?.length ?? 0) > 0;
  const hasTargetOptions = targetOptions.length > 0;
  const targetSearchHasNoMatches =
    isPcTarget && targetSearch.trim().length > 0 && hasAnyTargetOptions && !hasTargetOptions;
  const showDeviceSelector = selectedPlatform !== null && selectedPlatform !== "windows";
  const showMeasurementPanels =
    session?.status === "running" ||
    session?.status === "paused" ||
    session?.status === "stopped" ||
    session?.status === "failed" ||
    stream.metrics.length > 0;
  const waitingForMetrics = session?.status === "running" && stream.metrics.length === 0;
  const showMetricDetails = showMeasurementPanels && !waitingForMetrics;
  const isMockTarget =
    currentTarget?.name.toLowerCase().includes("mock") === true ||
    currentDevice !== undefined && isMockDevice(currentDevice);

  return (
    <div className="page session-workbench">
      <ToastList toasts={toasts.toasts} onDismiss={toasts.dismissToast} />
      <header className="page-header">
        <div>
          <h1>{t("session.title")}</h1>
          <p>{t("session.subtitle")}</p>
        </div>
        {showMeasurementPanels ? (
          <div className="summary-row">
            <SessionStatusBadge status={session?.status ?? "none"} />
            <ConnectionStatusBadge status={stream.connectionStatus} retryCount={stream.retryCount} />
            {session?.status === "stopped" ? (
              <a className="button button-secondary" href={`/report?sessionId=${session.id}`}>
                {t("session.viewReport")}
              </a>
            ) : null}
          </div>
        ) : null}
      </header>

      {error !== null ? <ApiErrorView error={error} /> : null}
      {stream.error !== null ? <ApiErrorView error={normalizeApiError(stream.error)} /> : null}

      <section className="panel test-wizard" aria-label={t("session.platformTitle")}>
        <div className="guide-panel__header">
          <div>
            <p className="eyebrow">{t("common.quickStart")}</p>
            <h2>{t("session.platformTitle")}</h2>
            <p>{t("session.platformSubtitle")}</p>
          </div>
          {session?.status === "stopped" ? (
            <a className="button button-secondary" href={`/report?sessionId=${session.id}`}>
              {t("session.openReportAfterStop")}
            </a>
          ) : null}
        </div>

        <div className="platform-grid" role="list" aria-label={t("session.platformTitle")}>
          {guidedPlatforms.map((platform) => {
            const platformDevice = platformDevices[platform];
            const active = selectedPlatform === platform;
            return (
              <button
                key={platform}
                className={`platform-card${active ? " is-active" : ""}`}
                type="button"
                onClick={() => handleSelectPlatform(platform)}
              >
                <span className="status-pill">
                  {platformDevice === undefined ? t("session.platformUnavailable") : t("session.platformAvailable")}
                </span>
                <strong>
                  {platform === "windows"
                    ? t("session.platformWindowsTitle")
                    : platform === "android"
                      ? t("session.platformAndroidTitle")
                      : t("session.platformIosTitle")}
                </strong>
                <span>
                  {platform === "windows"
                    ? t("session.platformWindowsBody")
                    : platform === "android"
                      ? t("session.platformAndroidBody")
                      : t("session.platformIosBody")}
                </span>
              </button>
            );
          })}
        </div>

        <div className="wizard-body">
          <div className="wizard-steps">
            <h3>{t("session.nextSteps")}</h3>
            <ol>
              {selectedPlatformSteps.map((key) => (
                <li key={key}>{t(key)}</li>
              ))}
            </ol>
            {selectedPlatformDevice === undefined ? (
              <p className="notice-text">{t("session.noPlatformDevice")}</p>
            ) : null}
            {isMockTarget ? <p className="notice-text">{t("session.mockHint")}</p> : null}
          </div>

          <div className="wizard-target">
            {selectedPlatform === null ? (
              <div className="wizard-placeholder">
                <h3>{t("session.choosePlatformFirstTitle")}</h3>
                <p>{t("session.choosePlatformFirstBody")}</p>
              </div>
            ) : (
              <>
                <div className="summary-row">
                  <span className="status-pill">
                    {t("session.selectedPlatform")}: {selectedPlatform}
                  </span>
                  <span className="status-pill">
                    {t("common.device")}: {selectedPlatformDevice === undefined ? t("common.na") : t("common.ready")}
                  </span>
                  <span className="status-pill">
                    {t("common.target")}:{" "}
                    {isAndroidTarget && targetId.length === 0
                      ? t("session.targetAutoDetect")
                      : targetId.length === 0
                        ? t("common.na")
                        : t("common.ready")}
                  </span>
                </div>

                {targetsState.loading ? <LoadingState label={t("device.loadingTargets")} /> : null}
                {targetsState.error !== null ? <ApiErrorView error={targetsState.error} /> : null}
                {showDeviceSelector ? (
                  <label>
                    {t("common.device")}
                    <select
                      disabled={fieldsLocked}
                      value={deviceId}
                      onChange={(event) => {
                        setDeviceId(event.target.value);
                        setTargetId("");
                        setTargetSearch("");
                        setAndroidForegroundTarget(null);
                        setSession(null);
                      }}
                    >
                      {deviceOptions.map((device) => (
                        <option key={device.id} value={device.id}>
                          {isMockDevice(device)
                            ? t("session.mockDeviceOption", { name: device.name })
                            : device.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {isPcTarget ? (
                  <label>
                    {t("session.targetSearch")}
                    <input
                      disabled={fieldsLocked || selectedPlatformDevice === undefined || !hasAnyTargetOptions}
                      placeholder={t("session.targetSearchPlaceholder")}
                      type="search"
                      value={targetSearch}
                      onChange={(event) => setTargetSearch(event.target.value)}
                    />
                  </label>
                ) : null}
                {isAndroidTarget ? (
                  <div className="target-autodetect-card">
                    <strong>{t("session.androidForegroundTitle")}</strong>
                    <p>
                      {androidForegroundTarget === null
                        ? t("session.androidForegroundPending")
                        : t("session.androidForegroundPackage", {
                            packageName: androidForegroundTarget.packageName ?? androidForegroundTarget.name
                          })}
                    </p>
                  </div>
                ) : isPcTarget ? (
                  <ProcessTargetPicker
                    disabled={fieldsLocked || selectedPlatformDevice === undefined || !hasTargetOptions}
                    emptyMessage={t("session.noWindowsTargetMatches")}
                    formatTarget={(target) => targetOptionLabel(target, selectedPlatform)}
                    label={t("session.windowsAppProcess")}
                    targets={targetOptions}
                    value={hasTargetOptions ? targetId : ""}
                    onChange={setTargetId}
                  />
                ) : (
                  <label>
                    {t("common.target")}
                    <select
                      disabled={fieldsLocked || selectedPlatformDevice === undefined || !hasTargetOptions}
                      value={hasTargetOptions ? targetId : ""}
                      onChange={(event) => setTargetId(event.target.value)}
                    >
                      {targetOptions.map((target) => (
                        <option key={target.id} value={target.id}>
                          {targetOptionLabel(target, selectedPlatform)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {targetsState.loading ? null : targetSearchHasNoMatches ? (
                  <div className="inline-help-row">
                    <p className="notice-text">{t("session.noWindowsTargetMatches")}</p>
                    <button className="button button-secondary" type="button" onClick={targetsState.reload}>
                      {t("session.refreshTargets")}
                    </button>
                  </div>
                ) : !isAndroidTarget && targetsState.data !== null && targetsState.data.length === 0 ? (
                  <div className="inline-help-row">
                    <p className="notice-text">
                      {selectedPlatform === "windows"
                        ? t("session.noWindowsTargets")
                        : selectedPlatform === "android"
                          ? t("session.noAndroidTargets")
                          : t("session.noTargetSelected")}
                    </p>
                    <button className="button button-secondary" type="button" onClick={targetsState.reload}>
                      {t("session.refreshTargets")}
                    </button>
                  </div>
                ) : !isAndroidTarget && targetId.length === 0 ? (
                  <p className="notice-text">{t("session.noTargetSelected")}</p>
                ) : null}

                <div className="session-controls session-controls--primary">
                  {session?.status === "running" ? (
                    <button
                      className="button button-danger"
                      disabled={busy === "stop"}
                      type="button"
                      onClick={() => setConfirmStopOpen(true)}
                    >
                      {busy === "stop" ? t("session.endingTest") : t("session.endTest")}
                    </button>
                  ) : (
                    <button
                      className="button button-primary"
                      disabled={guidedStartDisabled}
                      type="button"
                      onClick={() => void handleGuidedStart()}
                    >
                      {busy === "create" || busy === "start" ? t("session.startingTest") : t("session.startTest")}
                    </button>
                  )}
                  {session?.status === "stopped" ? (
                    <span className="status-pill availability-badge--available">{t("session.reportReady")}</span>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {showMeasurementPanels ? (
        <section className="panel top-status-strip" aria-label={t("session.statusDetails")}>
          <div className="summary-row">
            <span className="status-pill">
              session: {session?.id ?? t("session.notCreated")}
            </span>
            <span className="status-pill">
              {t("common.metrics")}: {stream.metrics.length}
            </span>
            <span className="status-pill">
              {t("common.source")}:{" "}
              {latestSource ?? (isAndroidTarget ? "adb" : isPcTarget ? "windows" : isIosTarget ? "manual trace" : "mock")}
            </span>
            <span className="status-pill">
              {t("session.reconnectAttempts")}: {stream.retryCount}
            </span>
            {isAndroidTarget || isPcTarget ? (
              <span className="status-pill">
                {t("common.pid")}: {String(currentPid ?? t("common.na"))}
              </span>
            ) : null}
          </div>
          {latestNetworkMetric?.precision === "device_level" ? (
            <p className="notice-text">{t("session.deviceNetworkNotice")}</p>
          ) : networkScope === "app_uid" ? (
            <p className="notice-text">{t("session.uidNetworkNotice")}</p>
          ) : currentDevice?.platform === "android" ? (
            <p className="notice-text">{t("session.androidNetworkNotice")}</p>
          ) : null}
          {isAndroidTarget ? (
            <p className="notice-text">{t("session.androidFpsNotice")}</p>
          ) : null}
          {isPcTarget ? (
            <p className="notice-text">
              {t("session.pcNotice", { availability: pcFpsAvailability?.status ?? t("common.unknown") })}
            </p>
          ) : null}
          {isIosTarget ? (
            <p className="notice-text">{t("session.iosNotice")}</p>
          ) : null}
          {isAndroidTarget ? <AndroidFallbackNotice metrics={stream.metrics} /> : null}
        </section>
      ) : null}

      {selectedPlatform !== null ? (
        <section className="panel advanced-settings-panel">
          <h2>{t("session.advancedSettings")}</h2>
          <div className="form-grid">
            <div className="settings-field">
              <label>
                {t("session.sampleInterval")}
                <input
                  disabled={fieldsLocked}
                  min={50}
                  step={50}
                  type="number"
                  value={sampleIntervalMs}
                  onChange={(event) => setSampleIntervalMs(Number(event.target.value))}
                />
              </label>
              <p className="notice-text">{t("session.sampleIntervalHelp")}</p>
            </div>
            <div className="settings-field">
              <label>
                {t("session.reportOutputDir")}
                <input readOnly value={reportOutputDir ?? t("session.reportOutputDirUnavailable")} />
              </label>
              <p className="notice-text">{t("session.reportOutputDirHelp")}</p>
            </div>
          </div>
          <div className="inline-help-row">
            <button
              className="button button-primary"
              disabled={!canChooseReportOutputDir || reportOutputBusy}
              type="button"
              onClick={() => void handleChooseReportOutputDir()}
            >
              {reportOutputBusy ? t("session.settingReportOutputDir") : t("session.setReportOutputDir")}
            </button>
            <button
              className="button button-secondary"
              disabled={!canOpenReportOutputDir}
              type="button"
              onClick={() => void handleOpenReportOutputDir()}
            >
              {t("session.openReportOutputDir")}
            </button>
          </div>
          <p className="notice-text">{t("session.simpleSettingsHelp")}</p>
        </section>
      ) : null}

      {waitingForMetrics ? (
        <section className="panel">
          <h2>{t("session.waitingForMetricsTitle")}</h2>
          <p>{t("session.waitingForMetricsMessage")}</p>
          <div className="summary-row">
            <ConnectionStatusBadge status={stream.connectionStatus} retryCount={stream.retryCount} />
          </div>
        </section>
      ) : null}

      {showMetricDetails ? <MetricQualityLegend /> : null}

      {showMetricDetails && isPcTarget && enablePresentMonCapture ? (
        <>
          <PresentMonPermissionNotice active={enablePresentMonCapture} />
          <PresentMonCsvRetentionPanel
            keepCsv={keepPresentMonCsv}
            retentionMode={presentMonRetentionMode}
          />
          <PresentMonCaptureStatusPanel status={presentMonStatusState.data ?? null} />
        </>
      ) : null}

      {(showMetricDetails || (isIosTarget && session !== null)) && isIosTarget ? (
        <IosTraceImportPanel
          session={session}
          target={currentTarget}
          onImported={(result) => {
            toasts.showToast(
              result.status === "success"
                ? `Imported ${result.metricCount} iOS trace metrics.`
                : "iOS trace import produced no metrics.",
              result.status === "success" ? "success" : "info"
            );
          }}
        />
      ) : null}

      {showMetricDetails ? (
        <section className="metric-grid">
          <MetricCard title={t("metric.fps")} value={latest.fps?.value} unit="fps" {...latest.fps} />
          <MetricCard title={t("metric.frameTime")} value={latest.frameTime?.value} unit="ms" {...latest.frameTime} />
          <MetricCard title={t("metric.cpu")} value={latest.cpu?.value} unit="%" {...latest.cpu} />
          <MetricCard title={t("metric.memory")} value={latest.memory?.value} unit="MB" {...latest.memory} />
          {isAndroidTarget ? (
            <>
              <MetricCard title={t("metric.battery")} value={latest.batteryLevel?.value} unit="%" {...latest.batteryLevel} />
              <MetricCard
                title={t("metric.networkRxRate")}
                value={latest.networkRxRate?.value}
                unit="B/s"
                {...latest.networkRxRate}
              />
              <MetricCard
                title={t("metric.networkTxRate")}
                value={latest.networkTxRate?.value}
                unit="B/s"
                {...latest.networkTxRate}
              />
            </>
          ) : null}
        </section>
      ) : null}

      {showMetricDetails ? (
      <section className="panel">
        <div className="summary-row">
          <TimeWindowControls value={metricWindow} onChange={setMetricWindow} />
          <button className="button" type="button" onClick={() => setShortcutHelpOpen(true)}>
            {t("session.keyboardShortcuts")}
          </button>
        </div>
      </section>
      ) : null}

      {showMetricDetails ? <MetricChartPanel seriesState={chartWindowState} onClear={handleClearChartBuffer} /> : null}

      {showMetricDetails ? (
      <section className="panel">
        <h2>{t("session.markers")}</h2>
        <EventMarkerPanel disabled={session === null} labelInputRef={markerLabelRef} onAdd={handleAddMarker} />
        <MarkerTimeline markers={markers} />
      </section>
      ) : null}

      {showMetricDetails ? (
      <section className="panel">
        <div className="restore-row">
          <h2>{t("session.recentMetrics")}</h2>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => setMetricsCollapsed((current) => !current)}
          >
            {metricsCollapsed ? t("session.showRecentMetrics") : t("session.hideRecentMetrics")}
          </button>
        </div>
        {metricsCollapsed ? null : stream.metrics.length === 0 ? (
          <EmptyState title={t("session.noRealtimeMetrics")} message={t("session.noRealtimeMetricsMessage")} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("common.time")}</th>
                  <th>{t("common.metric")}</th>
                  <th>{t("common.value")}</th>
                  <th>{t("common.source")}</th>
                  <th>{t("common.precision")}</th>
                  <th>{t("common.confidence")}</th>
                </tr>
              </thead>
              <tbody>
                {stream.metrics
                  .slice()
                  .reverse()
                  .slice(0, 50)
                  .map((metric) => (
                    <tr key={`${metric.sequence ?? 0}-${metric.metricName}-${metric.timestampMs}`}>
                      <td>{formatTimestamp(metric.timestampMs)}</td>
                      <td>{metric.metricName}</td>
                      <td>{formatMetricValue(metric.value, metric.unit)}</td>
                      <td>{metric.source}</td>
                      <td>{metric.precision}</td>
                      <td>{metric.confidence ?? t("common.na")}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      ) : null}

      <ConfirmDialog
        open={confirmStopOpen}
        title={t("session.stopDialogTitle")}
        message={t("session.stopDialogMessage")}
        confirmLabel={t("session.stopDialogConfirm")}
        onConfirm={() => {
          setConfirmStopOpen(false);
          void handleStop();
        }}
        onCancel={() => setConfirmStopOpen(false)}
      />
      <KeyboardShortcutHelp open={shortcutHelpOpen} onClose={() => setShortcutHelpOpen(false)} />
    </div>
  );
}
