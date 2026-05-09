use crate::{
    packaging_diagnostics::export_packaging_diagnostics_json, sidecar_manifest::SidecarManifest,
    state::AppState,
};

pub fn export_packaging_diagnostics(state: &AppState, manifest: Option<SidecarManifest>) -> String {
    export_packaging_diagnostics_json(state, manifest)
}
