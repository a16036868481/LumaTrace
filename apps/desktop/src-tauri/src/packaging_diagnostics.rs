use serde_json::json;

use crate::{
    log_rotation, logging::sanitized_logs_dir, paths::sanitize_path,
    sidecar_manifest::SidecarManifest, state::AppState,
    storage_migration::get_storage_migration_status, toolchain::detect_toolchain,
};

pub fn export_packaging_diagnostics_json(
    state: &AppState,
    manifest: Option<SidecarManifest>,
) -> String {
    let db_path = state.paths.data_dir.join("lumatrace.db");
    let status = state.status.lock().ok().map(|value| value.clone());
    let payload = json!({
        "app": {
            "name": "LumaTrace",
            "packagingMilestone": "4B"
        },
        "toolchain": detect_toolchain(),
        "sidecarStatus": status.clone(),
        "sidecarCrashState": status.clone(),
        "crashRecovery": {
            "restartLimit": status.as_ref().map(|value| value.max_restarts),
            "restartCount": status.as_ref().map(|value| value.restart_count),
            "cooldownMs": status.as_ref().map(|value| value.restart_cooldown_ms),
            "lastCrashReason": status.as_ref().and_then(|value| value.last_crash_reason.clone())
        },
        "paths": {
            "dataDir": sanitize_path(&state.paths.data_dir),
            "logsDir": sanitized_logs_dir(state),
            "reportsDir": sanitize_path(&state.paths.reports_dir),
            "diagnosticsDir": sanitize_path(&state.paths.diagnostics_dir)
        },
        "logs": {
            "rotationPolicy": log_rotation::default_policy(),
            "logFiles": log_rotation::list_log_files(&state.paths.logs_dir),
            "rawLogsIncluded": false
        },
        "storage": get_storage_migration_status(&db_path),
        "auth": {
            "enabled": true,
            "token": "<redacted>"
        },
        "sidecarManifest": manifest,
        "limitations": {
            "productionReady": false,
            "codeSigningConfigured": false,
            "updaterConfigured": false
        }
    });
    serde_json::to_string_pretty(&payload).unwrap_or_else(|_| "{}".into())
}
