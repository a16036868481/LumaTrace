use std::{fs, path::PathBuf};

use tauri::{AppHandle, Manager};

#[derive(Clone, serde::Serialize)]
pub struct AppPaths {
    pub data_dir: PathBuf,
    pub reports_dir: PathBuf,
    pub diagnostics_dir: PathBuf,
    pub logs_dir: PathBuf,
    pub temp_dir: PathBuf,
}

#[derive(serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopPathSettings {
    report_output_dir: Option<PathBuf>,
}

fn settings_path(data_dir: &PathBuf) -> PathBuf {
    data_dir.join("desktop-settings.json")
}

fn read_report_output_dir(data_dir: &PathBuf) -> Option<PathBuf> {
    let text = fs::read_to_string(settings_path(data_dir)).ok()?;
    let settings = serde_json::from_str::<DesktopPathSettings>(&text).ok()?;
    let path = settings.report_output_dir?;
    if path.is_absolute() {
        Some(path)
    } else {
        None
    }
}

pub fn resolve_app_paths(app: &AppHandle) -> Result<AppPaths, String> {
    let path = app.path();
    let data_dir = path
        .app_local_data_dir()
        .map_err(|error| error.to_string())?;
    let logs_dir = path.app_log_dir().map_err(|error| error.to_string())?;
    let temp_dir = std::env::temp_dir().join("LumaTrace");
    fs::create_dir_all(&data_dir).map_err(|error| error.to_string())?;
    let default_reports_dir = data_dir.join("reports");
    let reports_dir = read_report_output_dir(&data_dir)
        .filter(|directory| fs::create_dir_all(directory).is_ok())
        .unwrap_or(default_reports_dir);
    let diagnostics_dir = data_dir.join("diagnostics");

    for directory in [
        &data_dir,
        &logs_dir,
        &temp_dir,
        &reports_dir,
        &diagnostics_dir,
    ] {
        fs::create_dir_all(directory).map_err(|error| error.to_string())?;
    }

    Ok(AppPaths {
        data_dir,
        reports_dir,
        diagnostics_dir,
        logs_dir,
        temp_dir,
    })
}

pub fn save_report_output_dir(data_dir: &PathBuf, reports_dir: &PathBuf) -> Result<(), String> {
    if !reports_dir.is_absolute() {
        return Err("report output directory must be an absolute path".into());
    }
    fs::create_dir_all(reports_dir).map_err(|error| error.to_string())?;
    let settings = DesktopPathSettings {
        report_output_dir: Some(reports_dir.clone()),
    };
    let text = serde_json::to_string_pretty(&settings).map_err(|error| error.to_string())?;
    fs::write(settings_path(data_dir), text).map_err(|error| error.to_string())
}

pub fn sanitize_path(path: &PathBuf) -> String {
    sanitize_path_text(&path.to_string_lossy())
}

pub fn sanitize_path_text(value: &str) -> String {
    let normalized = value.replace('\\', "/");
    if let Some(index) = normalized.find(":/Users/") {
        let prefix = &normalized[..index + ":/Users/".len()];
        let suffix = &normalized[index + ":/Users/".len()..];
        let rest = suffix.split_once('/').map(|(_, rest)| rest).unwrap_or("");
        return if rest.is_empty() {
            format!("{}<user>", prefix)
        } else {
            format!("{}<user>/{}", prefix, rest)
        };
    }
    for marker in ["/Users/", "/home/"] {
        if let Some(index) = normalized.find(marker) {
            let prefix = &normalized[..index + marker.len()];
            let suffix = &normalized[index + marker.len()..];
            let rest = suffix.split_once('/').map(|(_, rest)| rest).unwrap_or("");
            return if rest.is_empty() {
                format!("{}<user>", prefix)
            } else {
                format!("{}<user>/{}", prefix, rest)
            };
        }
    }
    normalized
}
