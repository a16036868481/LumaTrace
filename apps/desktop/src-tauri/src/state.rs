use std::{
    path::PathBuf,
    process::Child,
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

use crate::paths::AppPaths;

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SidecarCrashReason {
    pub reason_code: String,
    pub user_message: String,
    pub suggested_action: String,
    pub severity: String,
    pub sanitized_evidence: Option<String>,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SidecarStatus {
    pub status: String,
    pub pid: Option<u32>,
    pub port: Option<u16>,
    pub restart_count: u32,
    pub last_exit_code: Option<i32>,
    pub started_at: Option<u64>,
    pub exited_at: Option<u64>,
    pub signal: Option<String>,
    pub last_error: Option<String>,
    pub last_stdout_excerpt_sanitized: Option<String>,
    pub last_stderr_excerpt_sanitized: Option<String>,
    pub restart_cooldown_ms: u64,
    pub max_restarts: u32,
    pub next_restart_allowed_at: Option<u64>,
    pub last_crash_reason: Option<SidecarCrashReason>,
    pub last_known_port: Option<u16>,
    pub last_known_auth_required: Option<bool>,
    pub diagnostics_id: Option<String>,
    pub artifact_kind: Option<String>,
    pub production_ready: bool,
    pub message: Option<String>,
}

pub struct AppState {
    pub token: String,
    pub paths: AppPaths,
    pub report_output_dir_override: Mutex<Option<PathBuf>>,
    pub sidecar: Mutex<Option<Child>>,
    pub status: Mutex<SidecarStatus>,
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}
