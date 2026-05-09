import type { PackagedStatusResponse } from "../api/types";

interface PackagingNoticesPanelProps {
  status: PackagedStatusResponse | null;
}

export function PackagingNoticesPanel({ status }: PackagingNoticesPanelProps) {
  const manifest = status?.sidecarManifest;
  return (
    <section className="panel" aria-label="Packaging notices">
      <h2>Packaging Notices</h2>
      {manifest === undefined ? (
        <p>N/A</p>
      ) : (
        <>
          <div className="summary-row">
            <span className="status-pill">review: {manifest.licenseReviewStatus ?? "not generated"}</span>
            <span className="status-pill">production: {manifest.productionReady ? "ready" : "not ready"}</span>
            <span className="status-pill">notices: {manifest.noticesFile ?? "N/A"}</span>
            <span className="status-pill">third-party: {manifest.thirdPartyNoticesFile ?? "N/A"}</span>
          </div>
          <p className="notice-text">
            Notice files are generated for packaging review. They do not include auth tokens, raw logs,
            raw CSV, command lines, or full local paths, and they do not make the build production-ready.
          </p>
          <dl className="detail-list">
            <div>
              <dt>Packaging notices hash</dt>
              <dd>{manifest.noticesSha256 ?? "N/A"}</dd>
            </div>
            <div>
              <dt>Third-party notices hash</dt>
              <dd>{manifest.thirdPartyNoticesSha256 ?? "N/A"}</dd>
            </div>
          </dl>
        </>
      )}
    </section>
  );
}
