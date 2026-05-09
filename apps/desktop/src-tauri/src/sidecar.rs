use std::{
    io::Write,
    io::{BufRead, BufReader},
    net::TcpStream,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

use tauri::{AppHandle, Manager, State};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use crate::{
    crash_recovery::{classify_sidecar_failure, classify_sidecar_reason, sanitize_process_excerpt},
    logging::log_supervisor,
    paths::sanitize_path,
    sidecar_manifest::{manifest_path, read_sidecar_manifest, sidecar_file_name},
    state::{now_ms, AppState, SidecarStatus},
};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn resolve_sidecar_binary(app: &AppHandle) -> Result<PathBuf, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| error.to_string())?;
    let manifest = read_sidecar_manifest(app);
    let mut names = Vec::new();
    if let Some(value) = manifest.as_ref().map(|value| value.file_name.clone()) {
        names.push(value);
    }
    if cfg!(windows) {
        names.push("lumatrace-local-server.exe".into());
    } else {
        names.push("lumatrace-local-server".into());
    }

    let mut dirs = vec![resource_dir.join("binaries"), resource_dir.clone()];
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(parent) = current_exe.parent() {
            dirs.push(parent.join("binaries"));
            dirs.push(parent.to_path_buf());
        }
    }

    for dir in &dirs {
        for name in &names {
            let candidate = dir.join(name);
            if candidate.exists() {
                return Ok(candidate);
            }
        }
    }

    Ok(resource_dir.join("binaries").join(sidecar_file_name(app)))
}

fn resolve_sidecar_runtime_dir(app: &AppHandle) -> Option<PathBuf> {
    let manifest = read_sidecar_manifest(app)?;
    let runtime_directory = manifest.runtime_directory?;
    let resource_dir = app.path().resource_dir().ok()?;
    let mut dirs = vec![resource_dir.join("binaries"), resource_dir.clone()];
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(parent) = current_exe.parent() {
            dirs.push(parent.join("binaries"));
            dirs.push(parent.to_path_buf());
        }
    }
    if let Ok(current_dir) = std::env::current_dir() {
        if let Some(repo_root) = find_repo_root(&current_dir) {
            dirs.push(
                repo_root
                    .join("apps")
                    .join("desktop")
                    .join("src-tauri")
                    .join("binaries"),
            );
        }
    }
    dirs.into_iter()
        .map(|dir| dir.join(&runtime_directory))
        .find(|candidate| {
            let node_name = if cfg!(windows) { "node.exe" } else { "node" };
            candidate.join(node_name).exists()
                && candidate
                    .join("app")
                    .join("dist")
                    .join("src")
                    .join("index.js")
                    .exists()
        })
}

fn update_status(state: &AppState, next: SidecarStatus) -> Result<(), String> {
    let mut status = state
        .status
        .lock()
        .map_err(|_| "sidecar status lock poisoned")?;
    *status = next;
    Ok(())
}

fn next_status(state: &AppState, status: &str, message: Option<String>) -> SidecarStatus {
    let previous = state.status.lock().ok().map(|value| value.clone());
    SidecarStatus {
        status: status.into(),
        pid: previous.as_ref().and_then(|value| value.pid),
        port: previous.as_ref().and_then(|value| value.port),
        restart_count: previous
            .as_ref()
            .map(|value| value.restart_count)
            .unwrap_or_default(),
        last_exit_code: previous.as_ref().and_then(|value| value.last_exit_code),
        started_at: previous.as_ref().and_then(|value| value.started_at),
        exited_at: previous.as_ref().and_then(|value| value.exited_at),
        signal: previous.as_ref().and_then(|value| value.signal.clone()),
        last_error: previous.as_ref().and_then(|value| value.last_error.clone()),
        last_stdout_excerpt_sanitized: previous
            .as_ref()
            .and_then(|value| value.last_stdout_excerpt_sanitized.clone()),
        last_stderr_excerpt_sanitized: previous
            .as_ref()
            .and_then(|value| value.last_stderr_excerpt_sanitized.clone()),
        restart_cooldown_ms: previous
            .as_ref()
            .map(|value| value.restart_cooldown_ms)
            .unwrap_or(5_000),
        max_restarts: previous
            .as_ref()
            .map(|value| value.max_restarts)
            .unwrap_or(3),
        next_restart_allowed_at: previous
            .as_ref()
            .and_then(|value| value.next_restart_allowed_at),
        last_crash_reason: previous
            .as_ref()
            .and_then(|value| value.last_crash_reason.clone()),
        last_known_port: previous.as_ref().and_then(|value| value.last_known_port),
        last_known_auth_required: previous
            .as_ref()
            .and_then(|value| value.last_known_auth_required),
        diagnostics_id: previous
            .as_ref()
            .and_then(|value| value.diagnostics_id.clone()),
        artifact_kind: previous
            .as_ref()
            .and_then(|value| value.artifact_kind.clone()),
        production_ready: previous
            .as_ref()
            .map(|value| value.production_ready)
            .unwrap_or(false),
        message,
    }
}

fn find_repo_root(start: &Path) -> Option<PathBuf> {
    let mut cursor = start.to_path_buf();
    for _ in 0..8 {
        if cursor
            .join("apps")
            .join("local-server")
            .join("dist")
            .join("src")
            .join("index.js")
            .exists()
        {
            return Some(cursor);
        }
        if !cursor.pop() {
            break;
        }
    }
    None
}

pub fn current_report_output_dir(state: &AppState) -> PathBuf {
    state
        .report_output_dir_override
        .lock()
        .ok()
        .and_then(|value| value.clone())
        .unwrap_or_else(|| state.paths.reports_dir.clone())
}

pub fn spawn_local_server_sidecar(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    let manifest = read_sidecar_manifest(app);
    let binary_path = resolve_sidecar_binary(app)?;
    let db_path = state.paths.data_dir.join("lumatrace.db");
    let reports_dir = current_report_output_dir(&state);

    let mut starting = next_status(
        &state,
        "starting",
        Some(format!("starting {}", sanitize_path(&binary_path))),
    );
    starting.pid = None;
    starting.port = None;
    starting.last_exit_code = None;
    starting.started_at = Some(now_ms());
    starting.exited_at = None;
    starting.artifact_kind = manifest.as_ref().map(|value| value.artifact_kind.clone());
    starting.production_ready = manifest
        .as_ref()
        .map(|value| value.production_ready)
        .unwrap_or(false);
    update_status(&state, starting)?;

    let mut command = Command::new(binary_path);
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    command.env("LUMATRACE_AUTH_TOKEN", &state.token);
    if let Some(runtime_dir) = resolve_sidecar_runtime_dir(app) {
        command.env("LUMATRACE_SIDECAR_RUNTIME_DIR", runtime_dir);
    }
    if let Ok(current_dir) = std::env::current_dir() {
        if let Some(repo_root) = find_repo_root(&current_dir) {
            command.env("LUMATRACE_REPO_ROOT", repo_root);
        }
    }

    let mut child = command
        .arg("--packaged")
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg("0")
        .arg("--db-path")
        .arg(db_path)
        .arg("--reports-dir")
        .arg(&reports_dir)
        .arg("--diagnostics-dir")
        .arg(&state.paths.diagnostics_dir)
        .arg("--logs-dir")
        .arg(&state.paths.logs_dir)
        .arg("--sidecar-manifest")
        .arg(manifest_path(app).map_err(|error| error.to_string())?)
        .arg("--parent-pid")
        .arg(std::process::id().to_string())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| error.to_string())?;

    let pid = child.id();
    if let Some(stdout) = child.stdout.take() {
        let app_for_stdout = app.clone();
        thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                if let Ok(payload) = serde_json::from_str::<serde_json::Value>(&line) {
                    if payload.get("type").and_then(|value| value.as_str())
                        == Some("lumatrace.local-server.ready")
                    {
                        if let Some(port) = payload.get("port").and_then(|value| value.as_u64()) {
                            let state = app_for_stdout.state::<AppState>();
                            if let Ok(mut status) = state.status.lock() {
                                status.port = Some(port as u16);
                                status.last_known_port = Some(port as u16);
                                status.last_known_auth_required = Some(true);
                                status.status = "running".into();
                                status.message = Some("local-server sidecar ready".into());
                            };
                        }
                    }
                }
            }
        });
    }
    if let Some(stderr) = child.stderr.take() {
        let app_for_stderr = app.clone();
        thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                let state = app_for_stderr.state::<AppState>();
                if let Ok(mut status) = state.status.lock() {
                    let sanitized = sanitize_process_excerpt(&line, &state.token);
                    status.last_stderr_excerpt_sanitized = Some(sanitized.clone());
                    status.last_crash_reason = Some(classify_sidecar_reason(&line, &state.token));
                    let classified = classify_sidecar_failure(&line);
                    if classified != "crashed" {
                        status.status = classified.into();
                        status.last_error = Some(classified.replace('_', " "));
                    }
                    log_supervisor(&state, &format!("sidecar stderr: {}", sanitized));
                };
            }
        });
    }
    *state.sidecar.lock().map_err(|_| "sidecar lock poisoned")? = Some(child);
    let app_for_monitor = app.clone();
    thread::spawn(move || loop {
        thread::sleep(Duration::from_millis(250));
        let state = app_for_monitor.state::<AppState>();
        let exit_status = {
            let mut guard = match state.sidecar.lock() {
                Ok(value) => value,
                Err(_) => return,
            };
            let Some(child) = guard.as_mut() else {
                return;
            };
            match child.try_wait() {
                Ok(Some(status)) => {
                    *guard = None;
                    Some(status)
                }
                Ok(None) => None,
                Err(_) => None,
            }
        };
        if let Some(exit_status) = exit_status {
            let code = exit_status.code();
            if let Ok(mut status) = state.status.lock() {
                let was_stopping =
                    status.status == "stopping" || status.status == "shutdown_requested";
                status.exited_at = Some(now_ms());
                status.last_exit_code = code;
                status.pid = None;
                if was_stopping || code == Some(0) {
                    status.status = "stopped".into();
                    status.message = Some("local-server sidecar stopped".into());
                } else {
                    let evidence = status
                        .last_stderr_excerpt_sanitized
                        .clone()
                        .unwrap_or_else(|| format!("sidecar exited with code {:?}", code));
                    let reason = classify_sidecar_reason(&evidence, &state.token);
                    status.status = match reason.reason_code.as_str() {
                        "port_conflict" => "port_conflict".into(),
                        "auth_failed" => "auth_failed".into(),
                        "db_migration_failed" => "db_migration_failed".into(),
                        _ => "crashed".into(),
                    };
                    status.last_error = Some(reason.user_message.clone());
                    status.last_crash_reason = Some(reason);
                    status.message = Some("local-server sidecar exited unexpectedly".into());
                }
                log_supervisor(
                    &state,
                    &format!("local-server sidecar exited with code {:?}", code),
                );
            }
            return;
        }
    });
    let mut running = next_status(
        &state,
        "running",
        Some("local-server sidecar started".into()),
    );
    running.pid = Some(pid);
    running.last_exit_code = None;
    running.started_at = Some(now_ms());
    update_status(&state, running)?;
    log_supervisor(&state, "local-server sidecar started");
    Ok(())
}

pub fn stop_local_server_sidecar(state: &State<AppState>) -> Result<(), String> {
    {
        let mut status = state
            .status
            .lock()
            .map_err(|_| "sidecar status lock poisoned")?;
        status.status = "shutdown_requested".into();
        status.message = Some("graceful sidecar shutdown requested".into());
    }
    let port = state.status.lock().ok().and_then(|status| status.port);
    if let Some(port) = port {
        let _ = request_packaged_shutdown(port, &state.token);
    }
    let mut handle = state.sidecar.lock().map_err(|_| "sidecar lock poisoned")?;
    if let Some(child) = handle.as_mut() {
        let deadline = Instant::now() + Duration::from_millis(5_000);
        loop {
            match child.try_wait() {
                Ok(Some(_)) => break,
                Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(100)),
                _ => {
                    let _ = child.kill();
                    let _ = child.wait();
                    break;
                }
            }
        }
    }
    *handle = None;
    let mut stopped = next_status(
        state,
        "stopped",
        Some("local-server sidecar stopped".into()),
    );
    stopped.pid = None;
    stopped.port = None;
    stopped.exited_at = Some(now_ms());
    update_status(state, stopped)?;
    log_supervisor(state, "local-server sidecar stopped");
    Ok(())
}

fn request_packaged_shutdown(port: u16, token: &str) -> Result<(), String> {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).map_err(|error| error.to_string())?;
    stream
        .set_write_timeout(Some(Duration::from_millis(500)))
        .map_err(|error| error.to_string())?;
    let request = format!(
        "POST /api/packaged/shutdown HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nAuthorization: Bearer {}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        port, token
    );
    stream
        .write_all(request.as_bytes())
        .map_err(|error| error.to_string())
}

pub fn restart_local_server_sidecar(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    {
        let mut status = state
            .status
            .lock()
            .map_err(|_| "sidecar status lock poisoned")?;
        let now = now_ms();
        if status.restart_count >= status.max_restarts {
            status.status = "restart_limited".into();
            status.message = Some("restart limit reached".into());
            return Err("restart limit reached".into());
        }
        if let Some(next_allowed) = status.next_restart_allowed_at {
            if now < next_allowed {
                status.message = Some(format!("restart cooldown active until {}", next_allowed));
                return Err("restart cooldown active".into());
            }
        }
        status.restart_count += 1;
        status.next_restart_allowed_at = Some(now + status.restart_cooldown_ms);
        status.status = "starting".into();
    }
    stop_local_server_sidecar(&state)?;
    spawn_local_server_sidecar(app)
}

pub fn reconfigure_local_server_sidecar(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    stop_local_server_sidecar(&state)?;
    spawn_local_server_sidecar(app)
}

pub fn get_sidecar_status(state: &State<AppState>) -> Result<SidecarStatus, String> {
    Ok(state
        .status
        .lock()
        .map_err(|_| "sidecar status lock poisoned")?
        .clone())
}

pub fn clear_sidecar_crash_state(state: &State<AppState>) -> Result<SidecarStatus, String> {
    let mut status = state
        .status
        .lock()
        .map_err(|_| "sidecar status lock poisoned")?;
    status.restart_count = 0;
    status.next_restart_allowed_at = None;
    status.last_error = None;
    status.last_crash_reason = None;
    status.last_stdout_excerpt_sanitized = None;
    status.last_stderr_excerpt_sanitized = None;
    if status.status == "restart_limited" || status.status == "crashed" {
        status.status = "stopped".into();
    }
    status.message = Some("sidecar crash state cleared".into());
    Ok(status.clone())
}
