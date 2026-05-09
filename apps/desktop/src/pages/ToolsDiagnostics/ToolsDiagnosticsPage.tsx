import { useState } from "react";
import {
  getAndroidHealth,
  getDiagnostics,
  getPackagedStatus,
  getPcPresentMonStatus,
  getToolsStatus
} from "../../api/endpoints";
import type { DiagnosticRecord } from "../../api/types";
import { AndroidBetaChecklist } from "../../components/AndroidBetaChecklist";
import { AndroidCommandStatusTable } from "../../components/AndroidCommandStatusTable";
import { DiagnosticsTimeline } from "../../components/DiagnosticsTimeline";
import { ApiErrorView } from "../../components/ApiErrorView";
import { BugReportPanel } from "../../components/BugReportPanel";
import { EmptyState } from "../../components/EmptyState";
import { LoadingState } from "../../components/LoadingState";
import { LocalServerStatusPanel } from "../../components/LocalServerStatusPanel";
import { LogRotationPanel } from "../../components/LogRotationPanel";
import { ManualGuiQaTemplatePanel } from "../../components/ManualGuiQaTemplatePanel";
import { PackagingChecklist } from "../../components/PackagingChecklist";
import { PackagingDiagnosticsExportButton } from "../../components/PackagingDiagnosticsExportButton";
import { PackagingDiagnosticsPanel } from "../../components/PackagingDiagnosticsPanel";
import { PackagingNoticesPanel } from "../../components/PackagingNoticesPanel";
import { PackagingReleaseReadinessPanel } from "../../components/PackagingReleaseReadinessPanel";
import { PackagingRcGatePanel } from "../../components/PackagingRcGatePanel";
import { PackagingToolchainPanel } from "../../components/PackagingToolchainPanel";
import { PackagedStorageSmokePanel } from "../../components/PackagedStorageSmokePanel";
import { PackagedStorageStatusPanel } from "../../components/PackagedStorageStatusPanel";
import { PcBetaChecklist } from "../../components/PcBetaChecklist";
import { PresentMonPermissionNotice } from "../../components/PresentMonPermissionNotice";
import { ReleaseGateResultsPanel } from "../../components/ReleaseGateResultsPanel";
import { ReleaseResultWorkspacePanel } from "../../components/ReleaseResultWorkspacePanel";
import { SidecarCrashRecoveryPanel } from "../../components/SidecarCrashRecoveryPanel";
import { WindowsRcStatusPanel } from "../../components/WindowsRcStatusPanel";
import { useAsync } from "../../hooks/useAsync";
import { useDevices } from "../../hooks/useDevices";
import { useI18n } from "../../i18n/I18nProvider";
import { getPackagingDiagnosticsJson } from "../../tauri/packagingDiagnostics";
import { clearSidecarCrashState } from "../../tauri/sidecarCrashRecovery";
import { openLogsDirectory, restartSidecar } from "../../tauri/tauriClient";
import { getSidecarStatus } from "../../tauri/sidecarStatus";
import { getTauriToolchainStatus } from "../../tauri/toolchainStatus";

export function ToolsDiagnosticsPage() {
  const { t } = useI18n();
  const [level, setLevel] = useState<DiagnosticRecord["level"] | "all">("all");
  const devicesState = useDevices();
  const androidDeviceId = devicesState.data?.find((device) => device.platform === "android")?.id ?? null;
  const pcDeviceId = devicesState.data?.find((device) => device.platform === "windows")?.id ?? null;
  const toolsState = useAsync(() => getToolsStatus(), []);
  const packagedState = useAsync(() => getPackagedStatus(), []);
  const sidecarState = useAsync(() => getSidecarStatus(), []);
  const toolchainState = useAsync(() => getTauriToolchainStatus(), []);
  const packagingDiagnosticsState = useAsync(() => getPackagingDiagnosticsJson().catch(() => "N/A"), []);
  const androidHealthState = useAsync(
    () => (androidDeviceId === null ? Promise.resolve(null) : getAndroidHealth(androidDeviceId)),
    [androidDeviceId]
  );
  const presentMonState = useAsync(
    () => (pcDeviceId === null ? Promise.resolve(null) : getPcPresentMonStatus(pcDeviceId)),
    [pcDeviceId]
  );
  const diagnosticsState = useAsync(
    () => getDiagnostics({ limit: 100, ...(level === "all" ? {} : { level }) }),
    [level]
  );

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>{t("tools.title")}</h1>
          <p>{t("tools.subtitle")}</p>
        </div>
      </header>

      <section className="panel">
        <p>{t("tools.securityNotice")}</p>
        <h2>{t("tools.toolStatus")}</h2>
        {toolsState.loading ? <LoadingState label={t("tools.loadingToolStatus")} /> : null}
        {toolsState.error !== null ? <ApiErrorView error={toolsState.error} /> : null}
        {toolsState.data !== null && toolsState.data.length === 0 ? <EmptyState title={t("tools.noToolRecords")} /> : null}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("tools.tool")}</th>
                <th>{t("common.status")}</th>
                <th>{t("common.version")}</th>
                <th>{t("tools.reason")}</th>
                <th>{t("tools.suggestedAction")}</th>
              </tr>
            </thead>
            <tbody>
              {toolsState.data?.map((tool) => (
                <tr key={tool.toolName}>
                  <td>{tool.toolName}</td>
                  <td>{tool.status}</td>
                  <td>{tool.version ?? t("common.na")}</td>
                  <td>{tool.reason ?? t("common.na")}</td>
                  <td>{tool.suggestedAction ?? t("common.na")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <BugReportPanel />

      <LocalServerStatusPanel
        packagedStatus={packagedState.data}
        sidecarStatus={sidecarState.data}
        onRestart={() => {
          void restartSidecar()
            .catch(() => undefined)
            .then(() => {
              packagedState.reload();
              sidecarState.reload();
            });
        }}
      />
      <PackagingToolchainPanel status={toolchainState.data} />
      <PackagingChecklist />
      <WindowsRcStatusPanel status={packagedState.data} />
      <PackagingReleaseReadinessPanel status={packagedState.data} />
      <PackagingRcGatePanel status={packagedState.data} />
      <ReleaseGateResultsPanel status={packagedState.data} />
      <ReleaseResultWorkspacePanel status={packagedState.data} />
      <ManualGuiQaTemplatePanel status={packagedState.data} />
      <SidecarCrashRecoveryPanel
        status={sidecarState.data}
        onRestart={() => {
          void restartSidecar()
            .catch(() => undefined)
            .then(() => {
              packagedState.reload();
              sidecarState.reload();
            });
        }}
        onClear={() => {
          void clearSidecarCrashState()
            .catch(() => undefined)
            .then(() => sidecarState.reload());
        }}
      />
      <PackagedStorageStatusPanel status={packagedState.data} />
      <PackagedStorageSmokePanel />
      <LogRotationPanel status={packagedState.data} />
      <PackagingNoticesPanel status={packagedState.data} />
      <section className="panel">
        <h2>{t("tools.packagingActions")}</h2>
        <div className="summary-row">
          <button
            className="button button-secondary"
            type="button"
            onClick={() => void openLogsDirectory().catch(() => undefined)}
          >
            {t("common.openLogs")}
          </button>
          <PackagingDiagnosticsExportButton onExport={packagingDiagnosticsState.reload} />
        </div>
      </section>
      <PackagingDiagnosticsPanel diagnostics={packagingDiagnosticsState.data} />

      <AndroidBetaChecklist />
      {androidHealthState.data !== null ? <AndroidCommandStatusTable health={androidHealthState.data} /> : null}

      <PcBetaChecklist />
      <PresentMonPermissionNotice active />
      <section className="panel" aria-label={t("tools.presentMonCompatibility")}>
        <h2>{t("tools.presentMonCompatibility")}</h2>
        {presentMonState.loading ? <LoadingState label={t("tools.loadingPresentMon")} /> : null}
        {presentMonState.error !== null ? <ApiErrorView error={presentMonState.error} /> : null}
        {presentMonState.data === null ? (
          <EmptyState title={t("tools.noPcDevice")} message={t("tools.noPcDeviceMessage")} />
        ) : (
          <>
            <div className="summary-row">
              <span className="status-pill">
                {t("tools.tool")}: {presentMonState.data.toolStatus.status}
              </span>
              <span className="status-pill">
                {t("common.version")}:{" "}
                {presentMonState.data.compatibility?.version ?? presentMonState.data.toolStatus.version ?? t("common.na")}
              </span>
              <span className="status-pill">
                {t("tools.timedCapture")}:{" "}
                {presentMonState.data.compatibility?.supportsTimedCapture === true ? t("common.yes") : t("common.na")}
              </span>
              <span className="status-pill">
                {t("tools.pidFilter")}:{" "}
                {presentMonState.data.compatibility?.supportsProcessIdFilter === true ? t("common.yes") : t("tools.pidFallback")}
              </span>
              <span className="status-pill">
                {t("tools.outputFile")}:{" "}
                {presentMonState.data.compatibility?.supportsOutputFile === true ? t("common.yes") : t("common.na")}
              </span>
            </div>
            <p className="notice-text">
              {presentMonState.data.compatibility?.unsupportedReason ??
                presentMonState.data.toolStatus.reason ??
                t("tools.presentMonDefaultReason")}
            </p>
            {presentMonState.data.limitations !== undefined ? (
              <ul>
                {presentMonState.data.limitations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </section>

      <section className="panel">
        <h2>{t("tools.diagnostics")}</h2>
        <label className="filter-control">
          {t("tools.level")}
          <select
            value={level}
            onChange={(event) => setLevel(event.target.value as DiagnosticRecord["level"] | "all")}
          >
            <option value="all">{t("common.all")}</option>
            <option value="debug">{t("common.debug")}</option>
            <option value="info">{t("common.info")}</option>
            <option value="warn">{t("common.warn")}</option>
            <option value="error">{t("common.error")}</option>
          </select>
        </label>
        {diagnosticsState.loading ? <LoadingState label={t("tools.loadingDiagnostics")} /> : null}
        {diagnosticsState.error !== null ? <ApiErrorView error={diagnosticsState.error} /> : null}
        {diagnosticsState.data !== null && diagnosticsState.data.length === 0 ? (
          <EmptyState title={t("tools.noDiagnostics")} message={t("tools.noDiagnosticsMessage")} />
        ) : null}
        <DiagnosticsTimeline diagnostics={diagnosticsState.data ?? []} />
      </section>
    </div>
  );
}
