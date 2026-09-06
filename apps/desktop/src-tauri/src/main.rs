#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod auth;
mod commands;
mod crash_recovery;
mod diagnostics;
mod log_rotation;
mod logging;
mod packaging_diagnostics;
mod paths;
mod sidecar;
mod sidecar_manifest;
mod state;
mod storage_migration;
mod toolchain;
mod windows_fps_access;

use std::sync::Mutex;

use tauri::Manager;

use state::{AppState, SidecarStatus};

fn main() {
    if let Some(exit_code) = windows_fps_access::try_run_elevated_helper() {
        std::process::exit(exit_code);
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let paths = paths::resolve_app_paths(&handle)?;
            log_rotation::rotate_known_logs(&paths.logs_dir);
            let state = AppState {
                token: auth::generate_local_auth_token(),
                paths,
                report_output_dir_override: Mutex::new(None),
                sidecar: Mutex::new(None),
                status: Mutex::new(SidecarStatus {
                    status: "stopped".into(),
                    pid: None,
                    port: None,
                    restart_count: 0,
                    last_exit_code: None,
                    started_at: None,
                    exited_at: None,
                    signal: None,
                    last_error: None,
                    last_stdout_excerpt_sanitized: None,
                    last_stderr_excerpt_sanitized: None,
                    restart_cooldown_ms: 5_000,
                    max_restarts: 3,
                    next_restart_allowed_at: None,
                    last_crash_reason: None,
                    last_known_port: None,
                    last_known_auth_required: Some(true),
                    diagnostics_id: None,
                    artifact_kind: None,
                    production_ready: false,
                    message: None,
                }),
            };
            app.manage(state);
            let _ = sidecar::spawn_local_server_sidecar(&handle);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_local_server_info,
            commands::get_local_auth_token,
            commands::get_sidecar_status,
            commands::get_sidecar_crash_state,
            commands::restart_sidecar,
            commands::clear_sidecar_crash_state,
            commands::open_logs_directory,
            commands::open_reports_directory,
            commands::open_bug_report_page,
            commands::choose_report_output_directory,
            commands::export_packaging_diagnostics,
            commands::get_app_paths,
            commands::get_tauri_toolchain_status,
            commands::get_sidecar_manifest,
            commands::get_windows_fps_access_status,
            commands::enable_windows_fps_access
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let state = window.state::<AppState>();
                let _ = sidecar::stop_local_server_sidecar(&state);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running LumaTrace desktop");
}
