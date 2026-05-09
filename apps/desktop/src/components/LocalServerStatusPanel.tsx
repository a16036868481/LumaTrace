import type { PackagedStatusResponse } from "../api/types";
import type { SidecarStatus } from "../tauri/sidecarStatus";
import { useI18n } from "../i18n/I18nProvider";
import { EmptyState } from "./EmptyState";
import { SidecarStatusBadge } from "./SidecarStatusBadge";

interface LocalServerStatusPanelProps {
  packagedStatus: PackagedStatusResponse | null;
  sidecarStatus: SidecarStatus | null;
  onRestart?: () => void;
}

export function LocalServerStatusPanel({
  packagedStatus,
  sidecarStatus,
  onRestart
}: LocalServerStatusPanelProps) {
  const { t } = useI18n();

  if (packagedStatus === null) {
    return (
      <section className="panel" aria-label="Local server packaged status">
        <h2>{t("packaging.localServer")}</h2>
        <EmptyState title={t("packaging.statusUnavailable")} message={t("packaging.statusUnavailableMessage")} />
      </section>
    );
  }

  return (
    <section className="panel" aria-label="Local server packaged status">
      <h2>{t("packaging.localServer")}</h2>
      <div className="summary-row">
        <span className="status-pill">
          {t("common.mode")}: {packagedStatus.packaged ? t("common.packaged") : t("common.dev")}
        </span>
        <SidecarStatusBadge status={sidecarStatus} />
        <span className="status-pill">{t("common.host")}: {packagedStatus.host}</span>
        <span className="status-pill">{t("common.port")}: {packagedStatus.port}</span>
        <span className="status-pill">
          {t("common.auth")}: {packagedStatus.authRequired ? t("common.required") : t("common.dev")}
        </span>
        <span className="status-pill">{t("common.artifact")}: {packagedStatus.artifactKind ?? t("common.unknown")}</span>
        <span className="status-pill">
          {t("common.production")}: {packagedStatus.limitations?.productionReady === true ? t("common.ready") : t("common.notReady")}
        </span>
      </div>
      <dl className="detail-list">
        <div>
          <dt>{t("common.data")}</dt>
          <dd>{packagedStatus.dataDir ?? t("common.na")}</dd>
        </div>
        <div>
          <dt>{t("common.logs")}</dt>
          <dd>{packagedStatus.logsDir ?? t("common.na")}</dd>
        </div>
        <div>
          <dt>{t("common.reports")}</dt>
          <dd>{packagedStatus.reportsDir ?? t("common.na")}</dd>
        </div>
        <div>
          <dt>{t("common.sidecarManifest")}</dt>
          <dd>{packagedStatus.sidecarManifest?.fileName ?? t("common.na")}</dd>
        </div>
        <div>
          <dt>{t("common.sidecarRuntime")}</dt>
          <dd>
            {packagedStatus.sidecarManifest?.runtimeDirectory === undefined
              ? packagedStatus.sidecarManifest?.nodeRequired === false
                ? t("common.bundledRuntime")
                : t("common.systemNodeRequired")
              : `${packagedStatus.sidecarManifest.runtimeDirectory} (${packagedStatus.sidecarManifest.bundledNodeVersion ?? "Node bundled"})`}
          </dd>
        </div>
        <div>
          <dt>{t("common.runtimeSize")}</dt>
          <dd>
            {packagedStatus.sidecarManifest?.runtimeSizeBytes === undefined
              ? t("common.na")
              : `${Math.round(packagedStatus.sidecarManifest.runtimeSizeBytes / 1024 / 1024)} MB`}
          </dd>
        </div>
      </dl>
      {packagedStatus.sidecarManifest?.limitations !== undefined ? (
        <ul>
          {packagedStatus.sidecarManifest.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      ) : null}
      {onRestart !== undefined ? (
        <button className="button button-secondary" type="button" onClick={onRestart}>
          {t("common.restartSidecar")}
        </button>
      ) : null}
    </section>
  );
}
