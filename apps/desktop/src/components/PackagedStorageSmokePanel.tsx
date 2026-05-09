export function PackagedStorageSmokePanel() {
  return (
    <section className="panel" aria-label="Packaged storage smoke">
      <h2>Packaged Storage Smoke</h2>
      <p className="notice-text">
        The packaged storage smoke starts local-server in packaged mode, creates a mock session,
        generates a report, restarts with the same database path, and verifies that the session and
        report remain readable. It does not require Tauri, Android, PC targets, or network access.
      </p>
    </section>
  );
}
