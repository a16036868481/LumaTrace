use std::{
    path::{Path, PathBuf},
    process::Command,
};

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolchainStatus {
    pub rust_available: bool,
    pub cargo_version: Option<String>,
    pub rustc_version: Option<String>,
    pub tauri_cli_available: bool,
    pub tauri_cli_version: Option<String>,
    pub platform: String,
    pub arch: String,
    pub can_run_tauri_dev: bool,
    pub can_run_tauri_build: bool,
    pub missing_tools: Vec<String>,
    pub suggested_actions: Vec<String>,
}

fn command_version(command: &str, args: &[&str]) -> Option<String> {
    command_version_from(command, args, None)
}

fn command_version_from(command: &str, args: &[&str], cwd: Option<&Path>) -> Option<String> {
    let mut command = Command::new(command);
    command.args(args);
    if let Some(cwd) = cwd {
        command.current_dir(cwd);
    }
    let output = command.output().ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stdout.is_empty() {
        Some(stderr)
    } else {
        Some(stdout)
    }
}

fn find_repo_root() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(current_dir) = std::env::current_dir() {
        candidates.push(current_dir);
    }
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(parent) = current_exe.parent() {
            candidates.push(parent.to_path_buf());
        }
    }

    for start in candidates {
        let mut cursor = start;
        for _ in 0..8 {
            if cursor.join("pnpm-workspace.yaml").exists()
                && cursor
                    .join("apps")
                    .join("desktop")
                    .join("src-tauri")
                    .exists()
            {
                return Some(cursor);
            }
            if !cursor.pop() {
                break;
            }
        }
    }
    None
}

pub fn detect_toolchain() -> ToolchainStatus {
    let cargo_version = command_version("cargo", &["--version"]);
    let rustc_version = command_version("rustc", &["--version"]);
    let repo_root = find_repo_root();
    let tauri_cli_version = repo_root
        .as_deref()
        .and_then(|root| command_version_from("pnpm", &["tauri", "--version"], Some(root)))
        .or_else(|| {
            repo_root.as_deref().and_then(|root| {
                command_version_from("pnpm", &["exec", "tauri", "--version"], Some(root))
            })
        })
        .or_else(|| command_version("pnpm", &["tauri", "--version"]))
        .or_else(|| command_version("pnpm", &["exec", "tauri", "--version"]))
        .or_else(|| command_version("cargo", &["tauri", "--version"]));
    let rust_available = cargo_version.is_some() && rustc_version.is_some();
    let tauri_cli_available = tauri_cli_version.is_some();
    let mut missing_tools = Vec::new();
    let mut suggested_actions = Vec::new();

    if !rust_available {
        missing_tools.push("rust".into());
        suggested_actions.push("Install Rust with rustup before running Tauri builds.".into());
    }
    if !tauri_cli_available {
        missing_tools.push("tauri-cli".into());
        suggested_actions
            .push("Install or enable the Tauri CLI before running pnpm dev:tauri.".into());
    }

    ToolchainStatus {
        rust_available,
        cargo_version,
        rustc_version,
        tauri_cli_available,
        tauri_cli_version,
        platform: std::env::consts::OS.into(),
        arch: std::env::consts::ARCH.into(),
        can_run_tauri_dev: rust_available && tauri_cli_available,
        can_run_tauri_build: rust_available && tauri_cli_available,
        missing_tools,
        suggested_actions,
    }
}
