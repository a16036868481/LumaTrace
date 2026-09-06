use std::{
    thread,
    time::{Duration, Instant},
};

use tauri::{AppHandle, Manager, State};

use crate::{
    diagnostics::export_packaging_diagnostics as build_packaging_diagnostics,
    paths::{sanitize_path, save_report_output_dir},
    sidecar,
    sidecar_manifest::{read_sidecar_manifest, SidecarManifest},
    state::{AppState, SidecarStatus},
    toolchain::{detect_toolchain, ToolchainStatus},
    windows_fps_access::{self, WindowsFpsAccessStatus},
};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalServerInfo {
    mode: String,
    api_base_url: String,
    ws_base_url: String,
    host: String,
    port: u16,
    data_dir_sanitized: String,
    logs_dir_sanitized: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppPathsDto {
    data_dir_sanitized: String,
    logs_dir_sanitized: String,
    reports_dir_sanitized: String,
    diagnostics_dir_sanitized: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChooseReportOutputDirectoryResult {
    cancelled: bool,
    reports_dir_sanitized: Option<String>,
    local_server: Option<LocalServerInfo>,
}

#[tauri::command]
pub fn get_local_auth_token(state: State<AppState>) -> String {
    state.token.clone()
}

#[tauri::command]
pub fn get_local_server_info(state: State<AppState>) -> LocalServerInfo {
    let deadline = Instant::now() + Duration::from_millis(15_000);
    let mut port = None;
    while Instant::now() < deadline {
        let status = state.status.lock().expect("sidecar status lock poisoned");
        if let Some(value) = status.port {
            port = Some(value);
            break;
        }
        if matches!(
            status.status.as_str(),
            "crashed" | "restart_limited" | "auth_failed" | "port_conflict" | "db_migration_failed"
        ) {
            break;
        }
        drop(status);
        thread::sleep(Duration::from_millis(50));
    }
    let port = port.unwrap_or(3100);
    LocalServerInfo {
        mode: "packaged".into(),
        api_base_url: format!("http://127.0.0.1:{}", port),
        ws_base_url: format!("ws://127.0.0.1:{}", port),
        host: "127.0.0.1".into(),
        port,
        data_dir_sanitized: sanitize_path(&state.paths.data_dir),
        logs_dir_sanitized: sanitize_path(&state.paths.logs_dir),
    }
}

#[tauri::command]
pub fn get_sidecar_status(state: State<AppState>) -> Result<SidecarStatus, String> {
    sidecar::get_sidecar_status(&state)
}

#[tauri::command]
pub fn get_sidecar_crash_state(state: State<AppState>) -> Result<SidecarStatus, String> {
    sidecar::get_sidecar_status(&state)
}

#[tauri::command]
pub fn restart_sidecar(app: AppHandle) -> Result<LocalServerInfo, String> {
    sidecar::restart_local_server_sidecar(&app)?;
    Ok(get_local_server_info(app.state::<AppState>()))
}

#[tauri::command]
pub fn clear_sidecar_crash_state(state: State<AppState>) -> Result<SidecarStatus, String> {
    sidecar::clear_sidecar_crash_state(&state)
}

#[tauri::command]
pub fn open_logs_directory(state: State<AppState>) -> Result<(), String> {
    tauri_plugin_opener::open_path(state.paths.logs_dir.clone(), None::<&str>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn open_reports_directory(state: State<AppState>) -> Result<(), String> {
    tauri_plugin_opener::open_path(sidecar::current_report_output_dir(&state), None::<&str>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn open_bug_report_page() -> Result<(), String> {
    tauri_plugin_opener::open_url(
        "https://github.com/a16036868481/LumaTrace/issues/new?template=bug_report.yml",
        None::<&str>,
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn choose_report_output_directory(
    app: AppHandle,
) -> Result<ChooseReportOutputDirectoryResult, String> {
    let state = app.state::<AppState>();
    let current = sidecar::current_report_output_dir(&state);
    let Some(selected) = rfd::FileDialog::new()
        .set_directory(&current)
        .set_title("Select report output folder")
        .pick_folder()
    else {
        return Ok(ChooseReportOutputDirectoryResult {
            cancelled: true,
            reports_dir_sanitized: None,
            local_server: None,
        });
    };

    save_report_output_dir(&state.paths.data_dir, &selected)?;
    {
        let mut override_dir = state
            .report_output_dir_override
            .lock()
            .map_err(|_| "report output directory lock poisoned")?;
        *override_dir = Some(selected.clone());
    }
    sidecar::reconfigure_local_server_sidecar(&app)?;
    Ok(ChooseReportOutputDirectoryResult {
        cancelled: false,
        reports_dir_sanitized: Some(sanitize_path(&selected)),
        local_server: Some(get_local_server_info(app.state::<AppState>())),
    })
}

#[tauri::command]
pub fn export_packaging_diagnostics(app: AppHandle, state: State<AppState>) -> String {
    build_packaging_diagnostics(&state, read_sidecar_manifest(&app))
}

#[tauri::command]
pub fn get_app_paths(state: State<AppState>) -> AppPathsDto {
    AppPathsDto {
        data_dir_sanitized: sanitize_path(&state.paths.data_dir),
        logs_dir_sanitized: sanitize_path(&state.paths.logs_dir),
        reports_dir_sanitized: sanitize_path(&sidecar::current_report_output_dir(&state)),
        diagnostics_dir_sanitized: sanitize_path(&state.paths.diagnostics_dir),
    }
}

#[tauri::command]
pub fn get_tauri_toolchain_status() -> ToolchainStatus {
    detect_toolchain()
}

#[tauri::command]
pub fn get_sidecar_manifest(app: AppHandle) -> Option<SidecarManifest> {
    read_sidecar_manifest(&app)
}

#[tauri::command]
pub fn get_windows_fps_access_status() -> WindowsFpsAccessStatus {
    windows_fps_access::get_status()
}

#[tauri::command]
pub async fn enable_windows_fps_access() -> Result<WindowsFpsAccessStatus, String> {
    windows_fps_access::enable_for_current_user().await
}
