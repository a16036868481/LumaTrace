import type { ToolchainStatus } from "../tauri/toolchainStatus";

interface PackagingToolchainPanelProps {
  status: ToolchainStatus | null;
}

export function PackagingToolchainPanel({ status }: PackagingToolchainPanelProps) {
  return (
    <section className="panel" aria-label="Packaging toolchain status">
      <h2>Packaging Toolchain</h2>
      {status === null ? (
        <p>N/A</p>
      ) : (
        <>
          <div className="summary-row">
            <span className="status-pill">Rust: {status.rustAvailable ? "available" : "missing"}</span>
            <span className="status-pill">Tauri CLI: {status.tauriCliAvailable ? "available" : "missing"}</span>
            <span className="status-pill">platform: {status.platform}</span>
            <span className="status-pill">arch: {status.arch}</span>
          </div>
          <dl className="detail-list">
            <div>
              <dt>cargo</dt>
              <dd>{status.cargoVersion ?? "N/A"}</dd>
            </div>
            <div>
              <dt>rustc</dt>
              <dd>{status.rustcVersion ?? "N/A"}</dd>
            </div>
            <div>
              <dt>Tauri CLI</dt>
              <dd>{status.tauriCliVersion ?? "N/A"}</dd>
            </div>
          </dl>
          {status.missingTools.length > 0 ? (
            <p className="notice-text">Missing tools: {status.missingTools.join(", ")}</p>
          ) : null}
          {status.suggestedActions.length > 0 ? (
            <ul>
              {status.suggestedActions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </section>
  );
}

