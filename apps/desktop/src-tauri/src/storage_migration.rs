use std::path::Path;

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageMigrationStatus {
    pub db_exists: bool,
    pub migration_status: String,
}

pub fn get_storage_migration_status(db_path: &Path) -> StorageMigrationStatus {
    StorageMigrationStatus {
        db_exists: db_path.exists(),
        migration_status: "checked-by-sidecar-smoke".into(),
    }
}
