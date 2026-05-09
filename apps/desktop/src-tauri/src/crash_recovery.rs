use crate::{logging::redact_with_token, state::SidecarCrashReason};

pub fn classify_sidecar_failure(stderr: &str) -> &'static str {
    let normalized = stderr.to_ascii_lowercase();
    if stderr.contains("EADDRINUSE") || normalized.contains("address already in use") {
        return "port_conflict";
    }
    if stderr.contains("AUTH_REQUIRED")
        || stderr.contains("AUTH_INVALID")
        || normalized.contains("missing auth token")
        || normalized.contains("requires a local auth token")
    {
        return "auth_failed";
    }
    if normalized.contains("migration")
        || normalized.contains("schema_migrations")
        || normalized.contains("sqlite open error")
    {
        return "db_migration_failed";
    }
    "crashed"
}

pub fn classify_sidecar_reason(stderr: &str, token: &str) -> SidecarCrashReason {
    let evidence = sanitize_process_excerpt(stderr, token);
    match classify_sidecar_failure(&evidence) {
        "port_conflict" => SidecarCrashReason {
            reason_code: "port_conflict".into(),
            user_message: "The local-server sidecar could not bind its localhost port.".into(),
            suggested_action: "Restart the sidecar after closing the process that owns the port."
                .into(),
            severity: "error".into(),
            sanitized_evidence: Some(evidence),
        },
        "auth_failed" => SidecarCrashReason {
            reason_code: "auth_failed".into(),
            user_message: "The local-server sidecar rejected or missed its local auth token."
                .into(),
            suggested_action:
                "Restart the sidecar from the packaged app so a fresh in-memory token is passed."
                    .into(),
            severity: "error".into(),
            sanitized_evidence: Some(evidence),
        },
        "db_migration_failed" => SidecarCrashReason {
            reason_code: "db_migration_failed".into(),
            user_message: "The packaged database migration or schema check failed.".into(),
            suggested_action: "Export packaging diagnostics before resetting local packaged data."
                .into(),
            severity: "error".into(),
            sanitized_evidence: Some(evidence),
        },
        _ => SidecarCrashReason {
            reason_code: "unknown".into(),
            user_message: "The local-server sidecar exited unexpectedly.".into(),
            suggested_action: "Export packaging diagnostics and restart the sidecar.".into(),
            severity: "error".into(),
            sanitized_evidence: Some(evidence),
        },
    }
}

pub fn sanitize_process_excerpt(value: &str, token: &str) -> String {
    redact_with_token(value, token).chars().take(4096).collect()
}
