# macOS Bundle And Signing Draft

Milestone 4B is not a formal macOS release.

## Bundle Direction

The Tauri app bundle will include the React UI and local-server sidecar as an external binary. The sidecar manifest must record the macOS target triple, artifact hash, size, and production readiness.

## Signing And Notarization

Production macOS distribution requires a Developer ID certificate, hardened runtime configuration, and notarization. These are future work and are not complete in 4B.

## Permissions

LumaTrace does not use private APIs, root-only capabilities, or permission bypasses. Future iOS/Xcode workflows may require Xcode command line tools and explicit user/developer setup.

## Paths

Packaged macOS builds should use AppLocalData for SQLite, reports, and diagnostics, and AppLog for app and sidecar logs.

## Troubleshooting Notes

Unsigned local builds may be quarantined by macOS. `xattr`/quarantine troubleshooting can be documented for development builds, but production users should receive signed and notarized builds in a later milestone.

No updater and no notarization claim exists in 4B.

