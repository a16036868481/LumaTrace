use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
};

pub const DEFAULT_MAX_LOG_BYTES: u64 = 10 * 1024 * 1024;
pub const DEFAULT_MAX_LOG_FILES: usize = 5;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogRotationPolicy {
    pub max_file_size_bytes: u64,
    pub max_files: usize,
    pub rotate_on_startup: bool,
    pub rotate_when_threshold_exceeded: bool,
    pub delete_oldest: bool,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogFileMetadata {
    pub name: String,
    pub size_bytes: u64,
    pub rotated: bool,
    pub excerpt: Option<String>,
}

pub fn default_policy() -> LogRotationPolicy {
    LogRotationPolicy {
        max_file_size_bytes: DEFAULT_MAX_LOG_BYTES,
        max_files: DEFAULT_MAX_LOG_FILES,
        rotate_on_startup: true,
        rotate_when_threshold_exceeded: true,
        delete_oldest: true,
    }
}

pub fn rotate_log_file(path: &Path, max_bytes: u64, max_files: usize) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    let size = fs::metadata(path).map_err(|error| error.to_string())?.len();
    if size <= max_bytes {
        return Ok(());
    }

    let oldest = rotated_path(path, max_files);
    if oldest.exists() {
        let _ = fs::remove_file(oldest);
    }

    for index in (1..max_files).rev() {
        let source = rotated_path(path, index);
        let target = rotated_path(path, index + 1);
        if source.exists() {
            let _ = fs::rename(source, target);
        }
    }
    fs::rename(path, rotated_path(path, 1)).map_err(|error| error.to_string())?;
    fs::write(path, "").map_err(|error| error.to_string())
}

pub fn rotate_known_logs(logs_dir: &Path) {
    for name in [
        "app.log",
        "local-server.log",
        "sidecar-supervisor.log",
        "packaging-diagnostics.log",
    ] {
        let _ = rotate_log_file(
            &logs_dir.join(name),
            DEFAULT_MAX_LOG_BYTES,
            DEFAULT_MAX_LOG_FILES,
        );
    }
}

fn rotated_path(path: &Path, index: usize) -> PathBuf {
    PathBuf::from(format!("{}.{}", path.display(), index))
}

pub fn list_log_files(logs_dir: &Path) -> Vec<LogFileMetadata> {
    let mut files = Vec::new();
    let entries = match fs::read_dir(logs_dir) {
        Ok(value) => value,
        Err(_) => return files,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = match path.file_name().and_then(|value| value.to_str()) {
            Some(value) => value.to_string(),
            None => continue,
        };
        if !name.ends_with(".log") && !name.contains(".log.") {
            continue;
        }
        let size = fs::metadata(&path)
            .map(|metadata| metadata.len())
            .unwrap_or_default();
        files.push(LogFileMetadata {
            rotated: name.contains(".log."),
            excerpt: read_sanitized_excerpt(&path),
            name,
            size_bytes: size,
        });
    }
    files.sort_by(|left, right| left.name.cmp(&right.name));
    files
}

fn read_sanitized_excerpt(path: &Path) -> Option<String> {
    let file = fs::File::open(path).ok()?;
    let mut buffer = String::new();
    let _ = file.take(4096).read_to_string(&mut buffer);
    Some(sanitize_log_excerpt(&buffer))
}

pub fn sanitize_log_excerpt(text: &str) -> String {
    let mut sanitized = text.to_string();
    for marker in ["Bearer ", "lumatrace-auth.", "--auth-token "] {
        while let Some(index) = sanitized.find(marker) {
            let start = index + marker.len();
            let end = sanitized[start..]
                .find(|character: char| {
                    character.is_whitespace() || character == '"' || character == '\''
                })
                .map(|offset| start + offset)
                .unwrap_or_else(|| sanitized.len());
            sanitized.replace_range(start..end, "<redacted>");
        }
    }
    sanitized = sanitized.replace('\\', "/");
    if let Some(index) = sanitized.find("/Users/") {
        sanitized.replace_range(index.., "<local-path>");
    }
    if let Some(index) = sanitized.find("C:/Users/") {
        sanitized.replace_range(index.., "<local-path>");
    }
    sanitized.chars().take(4096).collect()
}
