import type { PackagedStatusResponse } from "../api/types";
import { useI18n } from "../i18n/I18nProvider";

interface WindowsRcStatusPanelProps {
  status: PackagedStatusResponse | null;
}

export function WindowsRcStatusPanel({ status }: WindowsRcStatusPanelProps) {
  const { t } = useI18n();
  const rcStatus = status?.windowsRcStatus;

  return (
    <section className="panel" aria-label="Windows release candidate status">
      <h2>{t("packaging.rcStatus")}</h2>
      <p className="notice-text">{t("packaging.rcNotice")}</p>
      {rcStatus === undefined ? (
        <p>{t("common.na")}</p>
      ) : (
        <>
          <div className="summary-row">
            <span className="status-pill">
              {t("common.status")}: {rcStatus.status}
            </span>
            <span className="status-pill">
              {t("common.candidate")}: {rcStatus.rcCandidateReady ? t("packaging.readyForReview") : t("common.notReady")}
            </span>
            <span className="status-pill">
              {t("common.production")}: {rcStatus.productionReady ? t("common.ready") : t("common.notReady")}
            </span>
            <span className="status-pill">
              {t("common.blockers")}: {rcStatus.blockers.length}
            </span>
          </div>
          <div className="details-grid" aria-label="Windows RC evidence summary">
            <div>
              <span>{t("packaging.sidecar")}</span>
              <strong>{rcStatus.evidence.selfContainedSidecar ? t("packaging.selfContainedDraft") : t("packaging.notSelfContained")}</strong>
            </div>
            <div>
              <span>{t("packaging.licenseReview")}</span>
              <strong>{rcStatus.evidence.licenseReviewStatus}</strong>
            </div>
            <div>
              <span>{t("packaging.manualResult")}</span>
              <strong>
                {rcStatus.evidence.manualGuiQaResultValid
                  ? rcStatus.evidence.manualGuiQaResultStatus
                  : t("packaging.missingInvalid")}
              </strong>
            </div>
            <div>
              <span>{t("packaging.rcGates")}</span>
              <strong>
                {t("packaging.passedCount", {
                  passed: rcStatus.gateCounts.passed,
                  total: rcStatus.gateCounts.total
                })}
              </strong>
            </div>
          </div>
          {rcStatus.blockers.length > 0 ? (
            <div>
              <h3>{t("packaging.blockingGates")}</h3>
              <ul>
                {rcStatus.blockers.map((blocker) => (
                  <li key={`${blocker.source}-${blocker.code}`}>
                    <strong>{blocker.code}</strong> ({blocker.source}): {blocker.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div>
            <h3>{t("packaging.nextActions")}</h3>
            <ul>
              {rcStatus.nextActions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}
