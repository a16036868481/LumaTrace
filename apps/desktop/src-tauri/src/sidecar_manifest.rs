use std::{fs, path::PathBuf};

use tauri::{AppHandle, Manager};

#[derive(Clone, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SidecarManifest {
    pub name: String,
    pub version: String,
    pub artifact_kind: String,
    pub platform: String,
    pub arch: String,
    pub target_triple: Option<String>,
    pub file_name: String,
    pub size_bytes: u64,
    pub sha256: String,
    pub build_time: String,
    pub source_package_version: String,
    pub node_required: bool,
    pub production_ready: bool,
    pub limitations: Vec<String>,
    pub tauri_external_bin: Option<String>,
    pub runtime_directory: Option<String>,
    pub runtime_size_bytes: Option<u64>,
    pub runtime_file_count: Option<u64>,
    pub bundled_node_version: Option<String>,
    pub notices_file: Option<String>,
    pub notices_sha256: Option<String>,
    pub third_party_notices_file: Option<String>,
    pub third_party_notices_sha256: Option<String>,
    pub license_review_status: Option<String>,
}

pub fn manifest_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .resource_dir()
        .map_err(|error| error.to_string())?
        .join("binaries")
        .join("sidecar-manifest.json"))
}

pub fn read_sidecar_manifest(app: &AppHandle) -> Option<SidecarManifest> {
    let path = manifest_path(app).ok()?;
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str::<SidecarManifest>(&text).ok()
}

pub fn sidecar_file_name(app: &AppHandle) -> String {
    if let Some(manifest) = read_sidecar_manifest(app) {
        return manifest.file_name;
    }
    if cfg!(windows) {
        "lumatrace-local-server.exe".into()
    } else {
        "lumatrace-local-server".into()
    }
}
