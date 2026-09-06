import { useEffect, useMemo, useRef, useState } from "react";
import type { MetricAvailabilityStatus } from "@lumatrace/core";
import {
  addMarker,
  createSession,
  getAndroidForegroundApp,
  getPresentMonCaptureStatus,
  getSession,
  startSession,
  stopSession
} from "../../api/endpoints";
import type { Device, EventMarker, Session, Target } from "../../api/types";
import { getQueryParam } from "../../app/routes";
import { ApiErrorView } from "../../components/ApiErrorView";
import { ConnectionStatusBadge } from "../../components/ConnectionStatusBadge";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EventMarkerPanel } from "../../components/EventMarkerPanel";
import { KeyboardShortcutHelp } from "../../components/KeyboardShortcutHelp";
import { LoadingState } from "../../components/LoadingState";
import { MarkerTimeline } from "../../components/MarkerTimeline";
import { MetricCard } from "../../components/MetricCard";
import { MetricQualityLegend } from "../../components/MetricQualityLegend";
import { PresentMonCaptureStatusPanel } from "../../components/PresentMonCaptureStatusPanel";
import { PresentMonCsvRetentionPanel } from "../../components/PresentMonCsvRetentionPanel";
import { PresentMonPermissionNotice } from "../../components/PresentMonPermissionNotice";
import { ProcessTargetPicker } from "../../components/ProcessTargetPicker";
import { PlatformGlyph } from "../../components/PlatformGlyph";
import { SessionStatusBadge } from "../../components/SessionStatusBadge";
import { TimeWindowControls } from "../../components/TimeWindowControls";
import { RealtimeMetricChart } from "../../components/charts/RealtimeMetricChart";
import {
  DEFAULT_WINDOWS_METRIC_SELECTION,
  MetricSelector,
  WindowsMetricSelector,
  type WindowsMetricAvailability,
  type WindowsMetricSelection,
  type WindowsTestMetric
} from "../../components/WindowsMetricSelector";
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
import { useI18n } from "../../i18n/I18nProvider";
import { buildReportLocalization } from "../../i18n/reportLocalization";
import { detectTauri } from "../../tauri/tauriClient";
import {
  enableWindowsFpsAccess,
  getWindowsFpsAccessStatus,
  isFpsAccessCancellation,
  type WindowsFpsAccessStatus
} from "../../tauri/windowsFpsAccess";
import { filterSeriesStateByWindow, type MetricWindow } from "../../utils/metricWindow";

type GuidedPlatform = "windows" | "android";

const guidedPlatforms = ["windows", "android"] as const satisfies readonly GuidedPlatform[];
const DEVICE_DISCOVERY_MIN_VISIBLE_MS = 600;

type ProfileName = "stable_60fps" | "janky_game" | "memory_growth";
type ProcessMissingPolicy =
  | "pause_process_metrics_keep_device_metrics"
  | "wait_for_rebind"
  | "fail_session";
type PresentMonTargetMode = "pid" | "process_name";
type PresentMonRetentionMode =
  | "delete_after_parse"
  | "keep_until_session_end"
  | "keep_user_requested";

const windowsRequestedMetricNames = [
  "fps",
  "cpu_percent",
  "gpu_utilization",
  "memory_mb",
  "power_w",
  "gpu_temperature_c"
] as const;

const windowsMetricCharts = [
  { key: "fps", metricName: "fps", labelKey: "metric.fps", unit: "fps", height: 180 },
  { key: "cpu", metricName: "cpu_percent", labelKey: "metric.cpu", unit: "%", height: 180 },
  { key: "gpu", metricName: "gpu_utilization", labelKey: "metric.gpu", unit: "%", height: 180 },
  { key: "memory", metricName: "memory_mb", labelKey: "metric.memory", unit: "MB", height: 180 },
  { key: "power", metricName: "power_w", labelKey: "metric.power", unit: "W", height: 180 },
  {
    key: "gpuTemperature",
    metricName: "gpu_temperature_c",
    labelKey: "metric.gpuTemperature",
    unit: "°C",
    height: 180
  }
] as const satisfies ReadonlyArray<{
  key: WindowsTestMetric;
  metricName: string;
  labelKey:
    | "metric.fps"
    | "metric.cpu"
    | "metric.gpu"
    | "metric.memory"
    | "metric.power"
    | "metric.gpuTemperature";
  unit: string;
  height: number;
}>;

const androidMetricCharts = [
  { key: "fps", metricName: "fps", labelKey: "metric.fps", unit: "fps", height: 180 },
  {
    key: "frameTime",
    metricName: "frame_time_ms",
    labelKey: "metric.frameTime",
    unit: "ms",
    height: 180
  },
  { key: "cpu", metricName: "cpu_percent", labelKey: "metric.cpu", unit: "%", height: 180 },
  {
    key: "memory",
    metricName: "memory_mb",
    labelKey: "metric.memory",
    unit: "MB",
    height: 180
  },
  {
    key: "battery",
    metricName: "battery_level_percent",
    labelKey: "metric.battery",
    unit: "%",
    height: 180
  },
  {
    key: "batteryTemperature",
    metricName: "battery_temperature_c",
    labelKey: "metric.batteryTemp",
    unit: "\u00b0C",
    height: 180
  }
] as const;

type AndroidTestMetric = (typeof androidMetricCharts)[number]["key"];

const DEFAULT_ANDROID_METRIC_SELECTION: Record<AndroidTestMetric, boolean> = {
  fps: true,
  frameTime: true,
  cpu: true,
  memory: true,
  battery: true,
  batteryTemperature: true
};

function isGuidedPlatform(value: string | undefined): value is GuidedPlatform {
  return value === "windows" || value === "android";
}

function isMockDevice(device: Device): boolean {
  return device.tags?.source === "mock" || device.name.toLowerCase().includes("mock");
}

function findPreferredDevice(
  devices: Device[] | null | undefined,
  platform: GuidedPlatform
): Device | undefined {
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
  if (
    currentDevice !== undefined &&
    isMockDevice(currentDevice) &&
    currentDevice.platform === platform
  ) {
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
    .filter(
      (value): value is string | number => typeof value === "string" || typeof value === "number"
    )
    .map((value) => String(value).toLowerCase())
    .join(" ");
  return searchable.includes(normalizedSearch);
}

function isRecommendedWindowsTarget(target: Target): boolean {
  const hasMainWindow = target.tags?.hasMainWindow;
  if (typeof hasMainWindow === "boolean") {
    return hasMainWindow;
  }
  const iconDataUrl = target.tags?.iconDataUrl;
  if (typeof iconDataUrl === "string" && iconDataUrl.startsWith("data:image/")) {
    return true;
  }
  if (target.executablePath === undefined) {
    return false;
  }
  const normalizedPath = target.executablePath.replace(/\\/g, "/").toLowerCase();
  return (
    !normalizedPath.includes("/windows/") && !normalizedPath.includes("/lumatrace-local-server")
  );
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
  const processName =
    typeof tags.processName === "string" && tags.processName.length > 0
      ? tags.processName
      : target.name;
  return pid === undefined ? processName : `${processName} (PID ${pid})`;
}

export function TestSessionPage() {
  const { locale, t } = useI18n();
  const queryDeviceId = getQueryParam("deviceId");
  const queryTargetId = getQueryParam("targetId");
  const querySessionId = getQueryParam("sessionId");
  const queryPlatform = getQueryParam("platform");
  const initialPlatform =
    queryPlatform !== null && isGuidedPlatform(queryPlatform) ? queryPlatform : null;
  const devicesState = useDevices();
  const [deviceId, setDeviceId] = useState(queryDeviceId ?? "");
  const [selectedPlatform, setSelectedPlatform] = useState<GuidedPlatform | null>(initialPlatform);
  const [targetId, setTargetId] = useState(queryTargetId ?? "");
  const [targetSearch, setTargetSearch] = useState("");
  const [androidForegroundTarget, setAndroidForegroundTarget] = useState<Target | null>(null);
  const [androidForegroundLoading, setAndroidForegroundLoading] = useState(false);
  const [deviceDiscoveryHold, setDeviceDiscoveryHold] = useState(false);
  const deviceDiscoveryHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const [presentMonTargetMode, setPresentMonTargetMode] = useState<PresentMonTargetMode>("pid");
  const [keepPresentMonCsv, setKeepPresentMonCsv] = useState(false);
  const [presentMonRetentionMode, setPresentMonRetentionMode] =
    useState<PresentMonRetentionMode>("delete_after_parse");
  const [processMissingPolicy, setProcessMissingPolicy] = useState<ProcessMissingPolicy>(
    "pause_process_metrics_keep_device_metrics"
  );
  const [launcherComponent, setLauncherComponent] = useState("");
  const [sampleIntervalMs, setSampleIntervalMs] = useState(100);
  const [exportLogsToReportDir, setExportLogsToReportDir] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [fpsAccessStatus, setFpsAccessStatus] = useState<WindowsFpsAccessStatus | null>(null);
  const [fpsAccessBusy, setFpsAccessBusy] = useState(false);
  const [windowsMetricSelection, setWindowsMetricSelection] = useState<WindowsMetricSelection>(
    DEFAULT_WINDOWS_METRIC_SELECTION
  );
  const [androidMetricSelection, setAndroidMetricSelection] = useState<
    Record<AndroidTestMetric, boolean>
  >(DEFAULT_ANDROID_METRIC_SELECTION);
  const [markers, setMarkers] = useState<EventMarker[]>([]);
  const [busy, setBusy] = useState<"create" | "start" | "stop" | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [confirmStopOpen, setConfirmStopOpen] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [metricWindow, setMetricWindow] = useState<MetricWindow>("all");
  const history = useSessionHistory(20);
  const stream = useReconnectableSessionStream(session?.id ?? null, session?.status === "running");
  const latest = useLatestMetrics(stream.metrics);
  const chartSeries = useRealtimeMetricSeries(1000);
  const markerLabelRef = useRef<HTMLInputElement | null>(null);
  const processedMetricCountRef = useRef(0);
  const autoFinalizedSessionRef = useRef<string | null>(null);
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
          android: undefined
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
  const targetOptions = useMemo(() => {
    if (isPcTarget) {
      const allPcTargets = targetsState.data ?? [];
      if (targetSearch.trim().length > 0) {
        return allPcTargets.filter((target) => targetMatchesSearch(target, targetSearch));
      }
      const recommendedTargets = allPcTargets
        .filter(isRecommendedWindowsTarget)
        .sort((left, right) => left.name.localeCompare(right.name));
      return recommendedTargets.length > 0 ? recommendedTargets : allPcTargets;
    }
    if (isAndroidTarget) {
      return androidForegroundTarget === null ? [] : [androidForegroundTarget];
    }
    return targetsState.data ?? [];
  }, [androidForegroundTarget, isAndroidTarget, isPcTarget, targetSearch, targetsState.data]);
  const chartWindowState = filterSeriesStateByWindow(chartSeries.seriesState, metricWindow);
  const presentMonStatusState = useAsync(
    () =>
      isPcTarget && session !== null
        ? getPresentMonCaptureStatus(session.id)
        : Promise.resolve(null),
    [isPcTarget, session?.id, session?.status, stream.metrics.length]
  );
  const isTauriRuntime = detectTauri();
  const windowsMetricAvailability = useMemo<WindowsMetricAvailability>(() => {
    const capabilities = currentDevice?.capabilities ?? [];
    const capabilityStatus = (
      metricNames: readonly string[],
      fallback: WindowsMetricAvailability[WindowsTestMetric]
    ): WindowsMetricAvailability[WindowsTestMetric] =>
      capabilities.find((capability) => metricNames.includes(capability.metricName))?.status ??
      fallback;

    return {
      fps:
        isTauriRuntime && fpsAccessStatus?.ready !== true
          ? "requires_permission"
          : capabilityStatus(["fps"], "experimental"),
      cpu: capabilityStatus(["cpu_percent"], "available"),
      gpu: capabilityStatus(["gpu_utilization", "gpu_percent"], "unavailable"),
      memory: capabilityStatus(["memory_mb"], "available"),
      power: capabilityStatus(["power_w"], "unavailable"),
      gpuTemperature: capabilityStatus(["gpu_temperature_c"], "requires_tool")
    };
  }, [currentDevice?.capabilities, fpsAccessStatus?.ready, isTauriRuntime]);
  const androidMetricAvailability = useMemo<
    Record<AndroidTestMetric, MetricAvailabilityStatus>
  >(() => {
    const capabilities = currentDevice?.capabilities ?? [];
    const capabilityStatus = (
      metricName: string,
      fallback: MetricAvailabilityStatus
    ): MetricAvailabilityStatus =>
      capabilities.find((capability) => capability.metricName === metricName)?.status ?? fallback;

    return {
      fps: capabilityStatus("fps", "experimental"),
      frameTime: capabilityStatus("frame_time_ms", "experimental"),
      cpu: capabilityStatus("cpu_percent", "available"),
      memory: capabilityStatus("memory_mb", "available"),
      battery: capabilityStatus("battery_level_percent", "available"),
      batteryTemperature: capabilityStatus("battery_temperature_c", "experimental")
    };
  }, [currentDevice?.capabilities]);
  useEffect(() => {
    return () => {
      if (deviceDiscoveryHoldTimerRef.current !== null) {
        clearTimeout(deviceDiscoveryHoldTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (selectedPlatform !== "windows" || !isTauriRuntime) {
      setFpsAccessStatus(null);
      return;
    }
    let active = true;
    void getWindowsFpsAccessStatus()
      .then((status) => {
        if (active) {
          setFpsAccessStatus(status);
        }
      })
      .catch(() => {
        if (active) {
          setFpsAccessStatus({
            supported: true,
            state: "error",
            ready: false,
            configured: false,
            requiresSignOut: false,
            canEnable: false,
            detailCode: "fps_access_check_failed"
          });
        }
      });
    return () => {
      active = false;
    };
  }, [isTauriRuntime, selectedPlatform]);

  useEffect(() => {
    if (deviceId.length === 0 && devicesState.data !== null && devicesState.data.length > 0) {
      const firstVisibleDevice = devicesState.data.find((device) => !isMockDevice(device));
      setDeviceId(
        findPreferredDevice(devicesState.data, selectedPlatform ?? "windows")?.id ??
          firstVisibleDevice?.id ??
          ""
      );
    }
  }, [deviceId, devicesState.data, selectedPlatform]);

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
    if (selectedPlatform !== "android" || !isAndroidTarget || deviceId.length === 0) {
      if (selectedPlatform !== "android") {
        setAndroidForegroundLoading(false);
      }
      return;
    }
    if (session?.status === "running") {
      setAndroidForegroundLoading(false);
      return;
    }

    let active = true;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    setAndroidForegroundLoading(true);

    const detectForegroundApp = async (): Promise<void> => {
      try {
        const foreground = await getAndroidForegroundApp(deviceId);
        if (!active) {
          return;
        }
        setAndroidForegroundTarget(foreground);
        setTargetId(foreground.id);
        setAndroidForegroundLoading(false);
      } catch {
        if (!active) {
          return;
        }
        setAndroidForegroundTarget(null);
        setTargetId("");
        setAndroidForegroundLoading(true);
      } finally {
        if (active) {
          refreshTimer = setTimeout(() => void detectForegroundApp(), 2500);
        }
      }
    };

    void detectForegroundApp();
    return () => {
      active = false;
      if (refreshTimer !== undefined) {
        clearTimeout(refreshTimer);
      }
    };
  }, [deviceId, isAndroidTarget, selectedPlatform, session?.status]);

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
    if (isPcTarget) {
      if (targetId.length > 0 && !targetOptions.some((target) => target.id === targetId)) {
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

  useEffect(() => {
    if (
      session === null ||
      session.status !== "running" ||
      (stream.sessionStatus !== "stopped" && stream.sessionStatus !== "failed") ||
      autoFinalizedSessionRef.current === session.id
    ) {
      return;
    }
    autoFinalizedSessionRef.current = session.id;
    void stopSession(session.id)
      .then((finalized) => {
        setSession(finalized);
        persistSession(finalized);
        setExportLogsToReportDir(false);
      })
      .catch((caught) => setError(normalizeApiError(caught)));
  }, [session, stream.sessionStatus]);

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
      typeof currentTarget?.tags?.launcherComponent === "string"
        ? currentTarget.tags.launcherComponent
        : "";
    if (targetLauncher.length > 0) {
      setLauncherComponent(targetLauncher);
    }
  }, [currentTarget, isAndroidTarget, launcherComponent.length]);

  async function runAction<T>(
    kind: "create" | "start" | "stop",
    action: () => Promise<T>
  ): Promise<T | null> {
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
          reportLocalization: buildReportLocalization(locale, t),
          exportLogsToReportDir,
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
                requestedMetrics: [...windowsRequestedMetricNames],
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

  async function handleEnableWindowsFpsAccess(): Promise<WindowsFpsAccessStatus | null> {
    setFpsAccessBusy(true);
    try {
      const status = await enableWindowsFpsAccess();
      setFpsAccessStatus(status);
      return status;
    } catch (caught) {
      if (!isFpsAccessCancellation(caught)) {
        setFpsAccessStatus({
          supported: true,
          state: "error",
          ready: false,
          configured: false,
          requiresSignOut: false,
          canEnable: false,
          detailCode: "fps_access_enable_failed"
        });
      }
      return null;
    } finally {
      setFpsAccessBusy(false);
    }
  }

  async function handleRefreshWindowsFpsAccess(): Promise<WindowsFpsAccessStatus | null> {
    setFpsAccessBusy(true);
    try {
      const status = await getWindowsFpsAccessStatus();
      setFpsAccessStatus(status);
      return status;
    } catch {
      setFpsAccessStatus({
        supported: true,
        state: "error",
        ready: false,
        configured: false,
        requiresSignOut: false,
        canEnable: false,
        detailCode: "fps_access_check_failed"
      });
      return null;
    } finally {
      setFpsAccessBusy(false);
    }
  }

  async function handleWindowsPrimaryAction(): Promise<void> {
    if (!isPcTarget || !isTauriRuntime) {
      await handleGuidedStart();
      return;
    }
    let status = fpsAccessStatus === null ? await handleRefreshWindowsFpsAccess() : fpsAccessStatus;
    if (status?.state === "needs_setup" && status.canEnable) {
      status = await handleEnableWindowsFpsAccess();
    }
    void status;
    await handleGuidedStart();
  }

  async function handleStart(): Promise<void> {
    if (session === null) {
      return;
    }
    const started = await runAction("start", () => startSession(session.id));
    if (started !== null) {
      setSession(started);
      persistSession(started);
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
    }
  }

  function handleSelectPlatform(platform: GuidedPlatform | null): void {
    setSelectedPlatform(platform);
    if (deviceDiscoveryHoldTimerRef.current !== null) {
      clearTimeout(deviceDiscoveryHoldTimerRef.current);
      deviceDiscoveryHoldTimerRef.current = null;
    }
    if (platform !== null) {
      setDeviceDiscoveryHold(true);
      deviceDiscoveryHoldTimerRef.current = setTimeout(() => {
        setDeviceDiscoveryHold(false);
        deviceDiscoveryHoldTimerRef.current = null;
      }, DEVICE_DISCOVERY_MIN_VISIBLE_MS);
      devicesState.reload();
    } else {
      setDeviceDiscoveryHold(false);
    }
    setTargetSearch("");
    setTargetId("");
    setAndroidForegroundTarget(null);
    setAndroidForegroundLoading(platform === "android");
    setSession(null);
    setExportLogsToReportDir(false);
    setProcessMissingPolicy("pause_process_metrics_keep_device_metrics");
    setWindowsMetricSelection(DEFAULT_WINDOWS_METRIC_SELECTION);
    setAndroidMetricSelection(DEFAULT_ANDROID_METRIC_SELECTION);
  }

  async function handleStop(): Promise<void> {
    if (session === null) {
      return;
    }
    // The server broadcasts the terminal status before the stop request resolves.
    // Mark this session as handled first so the stream effect does not mistake a
    // user-requested stop for an unexpected target-process exit.
    autoFinalizedSessionRef.current = session.id;
    const stopped = await runAction("stop", () => stopSession(session.id));
    if (stopped !== null) {
      setSession(stopped);
      persistSession(stopped);
      setExportLogsToReportDir(false);
    } else {
      autoFinalizedSessionRef.current = null;
    }
  }

  async function handleAddMarker(input: {
    label: string;
    description?: string;
  }): Promise<EventMarker> {
    if (session === null) {
      throw new Error("Session is required.");
    }
    const marker = await addMarker(session.id, input);
    setMarkers((current) => [marker, ...current]);
    return marker;
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
      : (platformDevices[selectedPlatform] ??
        (currentDevice?.platform === selectedPlatform ? currentDevice : undefined));
  const selectedPlatformName =
    selectedPlatform === "windows"
      ? t("session.platformWindowsTitle")
      : selectedPlatform === "android"
        ? t("session.platformAndroidTitle")
        : t("common.na");
  const deviceDiscoveryLoading =
    selectedPlatform !== null &&
    (devicesState.loading || deviceDiscoveryHold) &&
    session?.status !== "running";
  const guidedStartDisabled =
    busy !== null ||
    fpsAccessBusy ||
    devicesState.loading ||
    targetsState.loading ||
    session?.status === "running" ||
    deviceId.length === 0 ||
    (selectedPlatform === "android" &&
      (androidForegroundLoading || androidForegroundTarget === null)) ||
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
  const simpleStep =
    session?.status === "stopped" || session?.status === "failed"
      ? 4
      : session?.status === "running" || session?.status === "paused"
        ? 3
        : selectedPlatform === null
          ? 1
          : 2;

  return (
    <div className="page session-workbench">
      <header className="page-header session-page-header">
        <div>
          <p className="eyebrow">
            {selectedPlatform === null ? "LumaTrace" : selectedPlatformName}
          </p>
          <h1>
            {selectedPlatform === null
              ? t("session.platformTitle")
              : session?.status === "running"
                ? t("session.runningTitle")
                : t("session.targetTitle")}
          </h1>
        </div>
        {showMeasurementPanels ? (
          <div className="summary-row">
            <SessionStatusBadge status={session?.status ?? "none"} />
            <ConnectionStatusBadge
              status={stream.connectionStatus}
              retryCount={stream.retryCount}
            />
            {session?.status === "stopped" || session?.status === "failed" ? (
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
        <div className="simple-stepper" aria-label={t("session.progressLabel")}>
          {[
            t("session.stepPlatform"),
            t("session.stepTarget"),
            t("session.stepRun"),
            t("session.stepReport")
          ].map((label, index) => (
            <span
              className={`${index + 1 === simpleStep ? "is-active" : ""}${index + 1 < simpleStep ? " is-complete" : ""}`}
              key={label}
            >
              <strong>{index + 1}</strong>
              {label}
            </span>
          ))}
        </div>

        {selectedPlatform === null ? (
          <div className="platform-grid" role="list" aria-label={t("session.platformTitle")}>
            {guidedPlatforms.map((platform) => {
              const platformDevice = platformDevices[platform];
              return (
                <button
                  key={platform}
                  className={`platform-card platform-card--visual platform-card--${platform}`}
                  type="button"
                  onClick={() => handleSelectPlatform(platform)}
                >
                  <span className="platform-card__glyph">
                    <PlatformGlyph platform={platform} size={42} />
                  </span>
                  <strong>
                    {platform === "windows"
                      ? t("session.platformWindowsTitle")
                      : t("session.platformAndroidTitle")}
                  </strong>
                  <span className="platform-card__short">
                    {platform === "windows"
                      ? t("dashboard.platformWindowsShort")
                      : t("dashboard.platformAndroidShort")}
                  </span>
                  <span
                    className={`platform-card__availability ${platformDevice === undefined ? "" : "is-ready"}`}
                  >
                    <i aria-hidden="true" />
                    {platformDevice === undefined
                      ? t("session.platformUnavailable")
                      : t("session.platformAvailable")}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="selected-platform-bar">
            <span
              className={`selected-platform-bar__glyph selected-platform-bar__glyph--${selectedPlatform}`}
            >
              <PlatformGlyph platform={selectedPlatform} size={28} />
            </span>
            <strong>{selectedPlatformName}</strong>
            <span
              aria-busy={deviceDiscoveryLoading}
              className={`status-pill ${
                deviceDiscoveryLoading || selectedPlatformDevice === undefined
                  ? ""
                  : "availability-badge--available"
              }`}
            >
              {deviceDiscoveryLoading
                ? t("dashboard.loadingDevices")
                : selectedPlatformDevice === undefined
                  ? t("session.platformUnavailable")
                  : t("session.platformAvailable")}
            </span>
            {session?.status !== "running" ? (
              <button
                className="button button-secondary"
                type="button"
                onClick={() => handleSelectPlatform(null)}
              >
                {t("session.changePlatform")}
              </button>
            ) : null}
          </div>
        )}

        {selectedPlatform !== null ? (
          <div className="wizard-body">
            {deviceDiscoveryLoading ? (
              <section
                aria-busy="true"
                aria-live="polite"
                className="device-discovery-loading"
              >
                <div className="device-discovery-loading__indicator" aria-hidden="true">
                  <span className="device-discovery-loading__ring" />
                  <PlatformGlyph platform={selectedPlatform} size={24} />
                </div>
                <div className="device-discovery-loading__content">
                  <strong>{t("dashboard.loadingDevices")}</strong>
                  <div
                    aria-label={t("dashboard.loadingDevices")}
                    className="device-discovery-loading__progress"
                    role="progressbar"
                  >
                    <span />
                  </div>
                </div>
              </section>
            ) : (
              <div className="wizard-target">
              {session?.status === "running" ? (
                <div className="run-focus-card">
                  <div>
                    <p className="eyebrow">{t("session.runningTitle")}</p>
                    <h3>{currentTarget?.name ?? selectedPlatformName}</h3>
                    <p>{t("session.runningHelp")}</p>
                  </div>
                  <button
                    className="button button-danger"
                    disabled={busy === "stop"}
                    type="button"
                    onClick={() => setConfirmStopOpen(true)}
                  >
                    {busy === "stop" ? t("session.endingTest") : t("session.endTest")}
                  </button>
                </div>
              ) : (
                <>
                  <div className="simple-target-heading">
                    <p>{t("session.targetHelp")}</p>
                    <div className="simple-target-heading__actions">
                      <label
                        className="session-log-export-toggle"
                        title={t("session.exportLogsToReportDirHelp")}
                      >
                        <input
                          checked={exportLogsToReportDir}
                          disabled={fieldsLocked || busy !== null}
                          type="checkbox"
                          onChange={(event) => setExportLogsToReportDir(event.target.checked)}
                        />
                        <span>{t("session.exportLogsToReportDir")}</span>
                      </label>
                      {isPcTarget ? (
                        <button
                          aria-busy={targetsState.loading}
                          aria-label={t("session.refreshTargets")}
                          className={`button button-secondary process-refresh-button${targetsState.loading ? " is-loading" : ""}`}
                          disabled={
                            fieldsLocked ||
                            targetsState.loading ||
                            selectedPlatformDevice === undefined
                          }
                          title={t("session.refreshTargets")}
                          type="button"
                          onClick={targetsState.reload}
                        >
                          <svg aria-hidden="true" viewBox="0 0 24 24">
                            <path d="M20 7v5h-5" />
                            <path d="M18.4 16.2A8 8 0 1 1 20 9" />
                          </svg>
                        </button>
                      ) : null}
                      <button
                        className="button button-primary button-large"
                        disabled={guidedStartDisabled}
                        type="button"
                        onClick={() => void handleWindowsPrimaryAction()}
                      >
                        {fpsAccessBusy
                          ? t("session.fpsAccessEnabling")
                          : busy === "create" || busy === "start"
                            ? t("session.startingTest")
                            : t("session.startTest")}
                      </button>
                    </div>
                  </div>

                  {targetsState.loading ? (
                    <LoadingState label={t("device.loadingTargets")} />
                  ) : null}
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
                          setAndroidForegroundLoading(selectedPlatform === "android");
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
                        aria-label={t("session.targetSearch")}
                        disabled={
                          fieldsLocked ||
                          selectedPlatformDevice === undefined ||
                          !hasAnyTargetOptions
                        }
                        placeholder={t("session.targetSearchPlaceholder")}
                        type="search"
                        value={targetSearch}
                        onChange={(event) => setTargetSearch(event.target.value)}
                      />
                    </label>
                  ) : null}
                  {isAndroidTarget ? (
                    <div
                      aria-busy={androidForegroundLoading}
                      aria-live="polite"
                      className="target-autodetect-card"
                    >
                      <strong>{t("session.androidForegroundTitle")}</strong>
                      {androidForegroundLoading || androidForegroundTarget === null ? (
                        <div className="target-autodetect-card__loading">
                          <p>{t("common.loading")}</p>
                          <div
                            aria-label={t("session.androidForegroundTitle")}
                            className="target-autodetect-card__progress"
                            role="progressbar"
                          >
                            <span />
                          </div>
                        </div>
                      ) : (
                        <div className="target-autodetect-card__detected">
                          <span className="target-autodetect-card__indicator" aria-hidden="true" />
                          <div>
                            <p className="target-autodetect-card__app-name">
                              {androidForegroundTarget.name}
                            </p>
                            <p>
                              {t("session.androidForegroundPackage", {
                                packageName:
                                  androidForegroundTarget.packageName ??
                                  androidForegroundTarget.name
                              })}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : isPcTarget ? (
                    <ProcessTargetPicker
                      disabled={
                        fieldsLocked || selectedPlatformDevice === undefined || !hasTargetOptions
                      }
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
                        disabled={
                          fieldsLocked || selectedPlatformDevice === undefined || !hasTargetOptions
                        }
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
                  {targetsState.loading || targetSearchHasNoMatches ? null : !isAndroidTarget &&
                    targetsState.data !== null &&
                    targetsState.data.length === 0 ? (
                    <div className="inline-help-row">
                      <p className="notice-text">
                        {selectedPlatform === "windows"
                          ? t("session.noWindowsTargets")
                          : selectedPlatform === "android"
                            ? t("session.noAndroidTargets")
                            : t("session.noTargetSelected")}
                      </p>
                      {selectedPlatform === "windows" ? null : (
                        <button
                          className="button button-secondary"
                          type="button"
                          onClick={targetsState.reload}
                        >
                          {t("session.refreshTargets")}
                        </button>
                      )}
                    </div>
                  ) : !isAndroidTarget && targetId.length === 0 ? (
                    <p className="notice-text">{t("session.noTargetSelected")}</p>
                  ) : null}

                  {session?.status === "stopped" ? (
                    <span className="status-pill availability-badge--available">
                      {t("session.reportReady")}
                    </span>
                  ) : null}
                </>
              )}
              </div>
            )}
          </div>
        ) : null}
      </section>

      {waitingForMetrics ? (
        <section className="panel collection-starting-panel" aria-busy="true" aria-live="polite">
          <div className="collection-starting-panel__loader" aria-hidden="true">
            <span className="collection-starting-panel__ring" />
            <span className="collection-starting-panel__core" />
          </div>
          <div className="collection-starting-panel__content">
            <h2>{t("session.waitingForMetricsTitle")}</h2>
            <p>{t("session.waitingForMetricsMessage")}</p>
            <div className="collection-starting-panel__progress" aria-hidden="true">
              <span />
            </div>
            <div className="summary-row">
              <ConnectionStatusBadge
                status={stream.connectionStatus}
                retryCount={stream.retryCount}
              />
            </div>
          </div>
        </section>
      ) : null}

      {showMetricDetails && isPcTarget ? (
        <WindowsMetricSelector
          availability={windowsMetricAvailability}
          value={windowsMetricSelection}
          onChange={(metric, enabled) =>
            setWindowsMetricSelection((current) => ({
              ...current,
              [metric]: enabled
            }))
          }
        />
      ) : null}

      {showMetricDetails && isAndroidTarget ? (
        <MetricSelector
          options={androidMetricCharts.map((metric) => ({
            key: metric.key,
            labelKey: metric.labelKey,
            availability: androidMetricAvailability[metric.key]
          }))}
          value={androidMetricSelection}
          onChange={(metric, enabled) =>
            setAndroidMetricSelection((current) => ({
              ...current,
              [metric]: enabled
            }))
          }
        />
      ) : null}

      {showMetricDetails && isPcTarget ? (
        <div className="session-live-metrics">
          {windowsMetricCharts
            .filter((metric) => windowsMetricSelection[metric.key])
            .map((metric) => (
              <RealtimeMetricChart
                key={metric.key}
                height={metric.height}
                loading={
                  session?.status === "running" &&
                  (windowsMetricAvailability[metric.key] === "available" ||
                    windowsMetricAvailability[metric.key] === "experimental")
                }
                maxPoints={300}
                series={chartWindowState[metric.metricName] ?? []}
                showLegend={metric.key !== "fps"}
                title={`${t("chart.realtimeCharts")} · ${t(metric.labelKey)}`}
                unit={metric.unit}
              />
            ))}
        </div>
      ) : showMetricDetails && isAndroidTarget ? (
        <div className="session-live-metrics">
          {androidMetricCharts
            .filter((metric) => androidMetricSelection[metric.key])
            .map((metric) => (
              <RealtimeMetricChart
                key={metric.key}
                height={metric.height}
                loading={
                  session?.status === "running" &&
                  (androidMetricAvailability[metric.key] === "available" ||
                    androidMetricAvailability[metric.key] === "experimental")
                }
                maxPoints={300}
                series={chartWindowState[metric.metricName] ?? []}
                showLegend={metric.key !== "fps"}
                title={`${t("chart.realtimeCharts")} · ${t(metric.labelKey)}`}
                unit={metric.unit}
              />
            ))}
        </div>
      ) : null}

      {selectedPlatform !== null ? (
        <details className="panel advanced-settings-panel">
          <summary>{t("session.advancedSettings")}</summary>
          <div className="advanced-settings-content">
            <p className="notice-text">{t("session.simpleSettingsHelp")}</p>
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
            </div>
          </div>
        </details>
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

      {showMetricDetails ? (
        <section className="metric-grid">
          {!isPcTarget || windowsMetricSelection.fps ? (
            <>
              <MetricCard
                availability={isPcTarget ? windowsMetricAvailability.fps : undefined}
                title={t("metric.fps")}
                value={latest.fps?.value}
                unit="fps"
                {...latest.fps}
              />
              <MetricCard
                availability={isPcTarget ? windowsMetricAvailability.fps : undefined}
                title={t("metric.frameTime")}
                value={latest.frameTime?.value}
                unit="ms"
                {...latest.frameTime}
              />
            </>
          ) : null}
          {!isPcTarget || windowsMetricSelection.cpu ? (
            <MetricCard
              availability={isPcTarget ? windowsMetricAvailability.cpu : undefined}
              title={t("metric.cpu")}
              value={latest.cpu?.value}
              unit="%"
              {...latest.cpu}
            />
          ) : null}
          {isPcTarget && windowsMetricSelection.gpu ? (
            <MetricCard
              availability={windowsMetricAvailability.gpu}
              title={t("metric.gpu")}
              value={latest.gpu?.value}
              unit="%"
              source={latest.gpu?.source ?? "planned"}
              precision={latest.gpu?.precision}
              confidence={latest.gpu?.confidence}
            />
          ) : null}
          {!isPcTarget || windowsMetricSelection.memory ? (
            <MetricCard
              availability={isPcTarget ? windowsMetricAvailability.memory : undefined}
              title={t("metric.memory")}
              value={latest.memory?.value}
              unit="MB"
              {...latest.memory}
            />
          ) : null}
          {isPcTarget && windowsMetricSelection.power ? (
            <MetricCard
              availability={windowsMetricAvailability.power}
              title={t("metric.power")}
              value={latest.power?.value}
              unit="W"
              source={latest.power?.source ?? "planned"}
              precision={latest.power?.precision}
              confidence={latest.power?.confidence}
            />
          ) : null}
          {isPcTarget && windowsMetricSelection.gpuTemperature ? (
            <MetricCard
              availability={windowsMetricAvailability.gpuTemperature}
              title={t("metric.gpuTemperature")}
              value={latest.gpuTemperature?.value}
              unit="°C"
              source={latest.gpuTemperature?.source ?? "planned"}
              precision={latest.gpuTemperature?.precision}
              confidence={latest.gpuTemperature?.confidence}
            />
          ) : null}
          {isAndroidTarget ? (
            <>
              <MetricCard
                title={t("metric.battery")}
                value={latest.batteryLevel?.value}
                unit="%"
                {...latest.batteryLevel}
              />
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

      {showMetricDetails ? (
        <section className="panel">
          <h2>{t("session.markers")}</h2>
          <EventMarkerPanel
            disabled={session === null}
            labelInputRef={markerLabelRef}
            onAdd={handleAddMarker}
          />
          <MarkerTimeline markers={markers} />
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
