use std::{fs::OpenOptions, io::Write};

use crate::{paths::sanitize_path, state::AppState};

pub fn redact(input: &str, token: &str) -> String {
    redact_with_token(input, token)
}

pub fn redact_with_token(input: &str, token: &str) -> String {
    input
        .replace(token, "<token>")
        .replace("\\Users\\", "\\<user>\\")
}

pub fn log_supervisor(state: &AppState, message: &str) {
    let path = state.paths.logs_dir.join("sidecar-supervisor.log");
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let line = redact(message, &state.token);
        let _ = writeln!(file, "{}", line);
    }
}

pub fn sanitized_logs_dir(state: &AppState) -> String {
    sanitize_path(&state.paths.logs_dir)
}
