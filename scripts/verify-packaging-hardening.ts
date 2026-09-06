import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

interface PackageJson {
  scripts?: Record<string, string>;
}

const requiredFiles = [
  "docs/packaging-hardening.md",
  "docs/windows-tool-bootstrap.md",
  "docs/windows-installer-draft.md",
  "docs/windows-preview-release.md",
  "docs/windows-packaging-manual-gui-checklist.md",
  "docs/windows-release-result-workspace.md",
  "docs/macos-bundle-signing-draft.md",
  "docs/packaging-qa-checklist.md",
  "scripts/detect-tauri-toolchain.ts",
  "scripts/bootstrap-windows-tools.ts",
  "scripts/verify-windows-tool-bootstrap.ts",
  "scripts/verify-sidecar-artifacts.ts",
  "scripts/verify-packaging-notices.ts",
  "scripts/verify-windows-bundle-draft.ts",
  "scripts/smoke-tauri-sidecar-auth-transport.ts",
  "scripts/build-tauri-installer-draft.ts",
  "scripts/verify-windows-installer-draft.ts",
  "scripts/smoke-windows-installer-draft.ts",
  "scripts/smoke-windows-installed-app-launch.ts",
  "scripts/smoke-windows-installed-sidecar-health.ts",
  "scripts/publish-windows-preview-release.ts",
  "scripts/verify-windows-preview-release.ts",
  "scripts/verify-windows-packaging-smoke-suite.ts",
  "scripts/export-windows-packaging-qa-evidence.ts",
  "scripts/verify-windows-packaging-qa-evidence.ts",
  "scripts/export-windows-manual-gui-qa-template.ts",
  "scripts/verify-windows-manual-gui-qa-template.ts",
  "scripts/export-windows-manual-gui-qa-handoff.ts",
  "scripts/verify-windows-manual-gui-qa-handoff.ts",
  "scripts/verify-windows-manual-gui-qa-result.ts",
  "scripts/smoke-windows-manual-gui-qa-result.ts",
  "scripts/smoke-windows-packaging-qa-evidence-manual-result.ts",
  "scripts/smoke-windows-packaging-rc-gate-manual-result.ts",
  "scripts/export-windows-packaging-release-readiness.ts",
  "scripts/verify-windows-packaging-release-readiness.ts",
  "scripts/export-windows-rc-status.ts",
  "scripts/verify-windows-rc-status.ts",
  "scripts/export-windows-packaging-rc-gate.ts",
  "scripts/verify-windows-packaging-rc-gate.ts",
  "scripts/smoke-windows-packaging-rc-gate-full-results.ts",
  "scripts/export-windows-release-policy-template.ts",
  "scripts/verify-windows-release-policy-template.ts",
  "scripts/export-windows-sidecar-production-readiness-template.ts",
  "scripts/verify-windows-sidecar-production-readiness-template.ts",
  "scripts/verify-windows-sidecar-production-readiness-result.ts",
  "scripts/smoke-windows-sidecar-production-readiness-result.ts",
  "scripts/smoke-windows-packaging-rc-gate-sidecar-readiness-result.ts",
  "scripts/export-windows-license-review-template.ts",
  "scripts/verify-windows-license-review-template.ts",
  "scripts/verify-windows-license-review-result.ts",
  "scripts/smoke-windows-license-review-result.ts",
  "scripts/smoke-windows-packaging-rc-gate-license-review-result.ts",
  "scripts/export-windows-code-signing-readiness-template.ts",
  "scripts/verify-windows-code-signing-readiness-template.ts",
  "scripts/verify-windows-code-signing-readiness-result.ts",
  "scripts/smoke-windows-code-signing-readiness-result.ts",
  "scripts/smoke-windows-packaging-rc-gate-code-signing-result.ts",
  "scripts/export-windows-updater-policy-readiness-template.ts",
  "scripts/verify-windows-updater-policy-readiness-template.ts",
  "scripts/verify-windows-updater-policy-readiness-result.ts",
  "scripts/smoke-windows-updater-policy-readiness-result.ts",
  "scripts/smoke-windows-packaging-rc-gate-updater-policy-result.ts",
  "scripts/export-windows-release-approval-readiness-template.ts",
  "scripts/verify-windows-release-approval-readiness-template.ts",
  "scripts/verify-windows-release-approval-readiness-result.ts",
  "scripts/smoke-windows-release-approval-readiness-result.ts",
  "scripts/smoke-windows-packaging-rc-gate-release-approval-result.ts",
  "scripts/export-windows-rc-reviewer-bundle.ts",
  "scripts/verify-windows-rc-reviewer-bundle.ts",
  "scripts/export-windows-release-gate-handoff.ts",
  "scripts/verify-windows-release-gate-handoff.ts",
  "scripts/export-windows-release-gate-results.ts",
  "scripts/verify-windows-release-gate-results.ts",
  "scripts/import-windows-release-gate-results.ts",
  "scripts/verify-windows-release-gate-results-import.ts",
  "scripts/smoke-windows-release-gate-results-import.ts",
  "scripts/smoke-windows-release-gate-results-partial.ts",
  "scripts/smoke-windows-release-gate-results-invalid.ts",
  "scripts/smoke-windows-release-gate-results-suite.ts",
  "scripts/export-windows-release-result-workspace.ts",
  "scripts/verify-windows-release-result-workspace.ts",
  "docs/windows-packaging-rc-gate.md",
  "docs/windows-preview-release.md",
  "docs/windows-release-policy-template.md",
  "docs/windows-sidecar-production-readiness-template.md",
  "docs/windows-sidecar-production-readiness-result.md",
  "docs/windows-license-review-result.md",
  "docs/windows-code-signing-readiness-template.md",
  "docs/windows-code-signing-readiness-result.md",
  "docs/windows-updater-policy-readiness-template.md",
  "docs/windows-updater-policy-readiness-result.md",
  "docs/windows-release-approval-readiness-template.md",
  "docs/windows-release-approval-readiness-result.md",
  "docs/windows-rc-reviewer-bundle.md",
  "docs/windows-release-gate-handoff.md",
  "docs/windows-release-gate-results.md",
  "docs/windows-release-result-workspace.md",
  "docs/windows-manual-gui-qa-handoff.md",
  "apps/local-server/scripts/build-self-contained-sidecar.ts",
  "apps/local-server/scripts/verify-sidecar-manifest.ts",
  "apps/desktop/src-tauri/src/toolchain.rs",
  "apps/desktop/src-tauri/src/sidecar_manifest.rs",
  "apps/desktop/src-tauri/tauri.dev.conf.json",
  "apps/desktop/src-tauri/src/crash_recovery.rs",
  "apps/desktop/src-tauri/src/log_rotation.rs",
  "apps/desktop/src-tauri/src/packaging_diagnostics.rs",
  "apps/local-server/src/diagnostics/sidecarCrashRecovery.ts",
  "apps/local-server/src/diagnostics/packagedStorageStatus.ts",
  "apps/local-server/src/diagnostics/logMetadata.ts",
  "apps/local-server/src/diagnostics/sanitizePackagedDiagnostics.ts",
  "apps/local-server/src/diagnostics/packagedDiagnosticsExport.ts",
  "apps/local-server/src/diagnostics/packagingReleaseReadiness.ts",
  "apps/local-server/src/diagnostics/packagingManualGuiQaHandoff.ts",
  "apps/local-server/src/diagnostics/packagingManualGuiQaResult.ts",
  "apps/local-server/src/diagnostics/packagingReleaseGateResults.ts",
  "apps/local-server/src/diagnostics/packagingReleaseGateResultsSuite.ts",
  "apps/local-server/src/diagnostics/packagingReleaseResultWorkspace.ts",
  "apps/local-server/src/diagnostics/packagingWindowsRcStatus.ts",
  "apps/local-server/src/diagnostics/packagingNotices.ts",
  "apps/local-server/src/diagnostics/windowsToolBootstrap.ts",
  "apps/desktop/src/components/LogRotationPanel.tsx",
  "apps/desktop/src/components/PackagingDiagnosticsExportButton.tsx",
  "apps/desktop/src/components/PackagingDiagnosticsPreview.tsx",
  "apps/desktop/src/components/PackagingNoticesPanel.tsx",
  "apps/desktop/src/components/SanitizedLogExcerpt.tsx",
  "apps/desktop/src/components/PackagingToolchainPanel.tsx",
  "apps/desktop/src/components/PackagingChecklist.tsx",
  "apps/desktop/src/components/PackagingReleaseReadinessPanel.tsx",
  "apps/desktop/src/components/ManualGuiQaTemplatePanel.tsx",
  "apps/desktop/src/components/ReleaseGateResultsPanel.tsx",
  "apps/desktop/src/components/ReleaseResultWorkspacePanel.tsx",
  "apps/desktop/src/components/WindowsRcStatusPanel.tsx",
  "apps/desktop/src/components/SidecarCrashRecoveryPanel.tsx",
  "apps/desktop/src/components/PackagedStorageStatusPanel.tsx"
] as const;

function readText(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

function check(name: string, passed: boolean): void {
  console.log(`${passed ? "[ok]" : "[fail]"} ${name}`);
  if (!passed) {
    process.exitCode = 1;
  }
}

for (const file of requiredFiles) {
  check(`file exists: ${file}`, existsSync(resolve(file)));
}

const packageJson = JSON.parse(readText("package.json")) as PackageJson;
for (const scriptName of [
  "detect:tauri-toolchain",
  "detect:windows-tools",
  "bootstrap:windows-tools",
  "verify:windows-tool-bootstrap",
  "build:self-contained-sidecar",
  "verify:sidecar-artifacts",
  "smoke:packaging-diagnostics",
  "smoke:self-contained-sidecar",
  "smoke:tauri-release-sidecar",
  "smoke:tauri-sidecar-auth-transport",
  "verify:packaging-notices",
  "verify:windows-bundle-draft",
  "build:tauri-installer-draft",
  "verify:windows-installer-draft",
  "smoke:windows-installer-draft",
  "smoke:windows-installed-app-launch",
  "smoke:windows-installed-sidecar-health",
  "release:windows-preview",
  "verify:windows-preview-release",
  "verify:windows-packaging-smoke-suite",
  "export:windows-packaging-qa-evidence",
  "verify:windows-packaging-qa-evidence",
  "export:windows-manual-gui-qa-template",
  "verify:windows-manual-gui-qa-template",
  "export:windows-manual-gui-qa-handoff",
  "verify:windows-manual-gui-qa-handoff",
  "verify:windows-manual-gui-qa-result",
  "smoke:windows-manual-gui-qa-result",
  "smoke:windows-packaging-qa-evidence-manual-result",
  "smoke:windows-packaging-rc-gate-manual-result",
  "export:windows-packaging-release-readiness",
  "verify:windows-packaging-release-readiness",
  "export:windows-rc-status",
  "verify:windows-rc-status",
  "export:windows-packaging-rc-gate",
  "verify:windows-packaging-rc-gate",
  "smoke:windows-packaging-rc-gate-full-results",
  "export:windows-release-policy-template",
  "verify:windows-release-policy-template",
  "export:windows-sidecar-production-readiness-template",
  "verify:windows-sidecar-production-readiness-template",
  "verify:windows-sidecar-production-readiness-result",
  "smoke:windows-sidecar-production-readiness-result",
  "smoke:windows-packaging-rc-gate-sidecar-readiness-result",
  "export:windows-license-review-template",
  "verify:windows-license-review-template",
  "verify:windows-license-review-result",
  "smoke:windows-license-review-result",
  "smoke:windows-packaging-rc-gate-license-review-result",
  "export:windows-code-signing-readiness-template",
  "verify:windows-code-signing-readiness-template",
  "verify:windows-code-signing-readiness-result",
  "smoke:windows-code-signing-readiness-result",
  "smoke:windows-packaging-rc-gate-code-signing-result",
  "export:windows-updater-policy-readiness-template",
  "verify:windows-updater-policy-readiness-template",
  "verify:windows-updater-policy-readiness-result",
  "smoke:windows-updater-policy-readiness-result",
  "smoke:windows-packaging-rc-gate-updater-policy-result",
  "export:windows-release-approval-readiness-template",
  "verify:windows-release-approval-readiness-template",
  "verify:windows-release-approval-readiness-result",
  "smoke:windows-release-approval-readiness-result",
  "smoke:windows-packaging-rc-gate-release-approval-result",
  "export:windows-rc-reviewer-bundle",
  "verify:windows-rc-reviewer-bundle",
  "export:windows-release-gate-handoff",
  "verify:windows-release-gate-handoff",
  "export:windows-release-gate-results",
  "verify:windows-release-gate-results",
  "import:windows-release-gate-results",
  "verify:windows-release-gate-results-import",
  "smoke:windows-release-gate-results-import",
  "smoke:windows-release-gate-results-partial",
  "smoke:windows-release-gate-results-invalid",
  "smoke:windows-release-gate-results-suite",
  "export:windows-release-result-workspace",
  "verify:windows-release-result-workspace",
  "smoke:packaged-storage",
  "smoke:sidecar-crash-recovery",
  "verify:packaging-hardening"
]) {
  check(`package script exists: ${scriptName}`, packageJson.scripts?.[scriptName] !== undefined);
}

const packagedEnv = readText("apps/local-server/src/config/packagedEnv.ts");
check("packaged mode requires token", /requires a local auth token/.test(packagedEnv));
check(
  "packaged mode rejects 0.0.0.0",
  /127\.0\.0\.1/.test(packagedEnv) && /must listen/.test(packagedEnv)
);

const desktopAuth = readText("apps/desktop/src/tauri/localAuth.ts");
check("desktop auth does not use localStorage", !/localStorage/.test(desktopAuth));

const docs = [
  "docs/packaging-hardening.md",
  "docs/windows-tool-bootstrap.md",
  "docs/tauri-packaging.md",
  "docs/sidecar-security.md",
  "docs/local-auth-token.md",
  "docs/packaging-troubleshooting.md",
  "docs/windows-installer-draft.md",
  "docs/windows-packaging-manual-gui-checklist.md",
  "docs/macos-bundle-signing-draft.md",
  "docs/packaging-qa-checklist.md",
  "docs/privacy-security.md",
  "docs/development.md",
  "docs/roadmap.md"
]
  .map(readText)
  .join("\n");

check(
  "docs mention cargo/Rust/Tauri CLI detection",
  /cargo/i.test(docs) && /Tauri CLI/i.test(docs)
);
check("docs mention token not in VITE", /VITE_/.test(docs) && /token/i.test(docs));
check(
  "docs mention token not in sidecar launch arguments",
  /token.*sidecar launch arguments|sidecar launch arguments.*token/i.test(docs)
);
check(
  "docs mention sidecar auth transport smoke",
  /sidecar auth transport smoke|smoke:tauri-sidecar-auth-transport/i.test(docs)
);
check("docs mention AppLocalData and AppLog", /AppLocalData/.test(docs) && /AppLog/.test(docs));
check("docs mention self-contained sidecar status", /self-contained sidecar/i.test(docs));
check(
  "docs mention Windows optional tool bootstrap",
  /windows optional tool bootstrap|detect:windows-tools|bootstrap:windows-tools/i.test(docs)
);
check(
  "docs mention fixed ADB and PresentMon package ids",
  /Google\.PlatformTools/.test(docs) && /Intel\.PresentMon\.Console/.test(docs)
);
check(
  "docs mention packaging notice manifest",
  /packaging notice|third-party notice|license notice/i.test(docs)
);
check(
  "docs mention license review remains required",
  /license notice review|release notice review/i.test(docs)
);
check(
  "docs mention diagnostics export JSON",
  /diagnostics export.*JSON|JSON.*diagnostics export/i.test(docs)
);
check(
  "docs mention raw logs are not exported",
  /raw logs.*not.*export|not.*export.*raw logs/i.test(docs)
);
check("docs mention token redaction", /token.*redact|redact.*token/i.test(docs));
check("docs mention restart cooldown", /restart cooldown/i.test(docs));
check("docs mention restart limit", /restart limit/i.test(docs));
check("docs mention packaged storage smoke", /packaged storage smoke/i.test(docs));
check(
  "docs mention Tauri release sidecar smoke",
  /release sidecar smoke|tauri release sidecar/i.test(docs)
);
check(
  "docs mention unsigned bundle draft",
  /unsigned.*bundle draft|portable release-directory/i.test(docs)
);
check(
  "docs mention unsigned installer draft probe",
  /unsigned.*installer draft|NSIS installer draft/i.test(docs)
);
check(
  "docs mention installer smoke temp install",
  /installer.*smoke|temporary.*install/i.test(docs)
);
check(
  "docs mention installed app launch smoke",
  /installed app launch smoke|launches the installed app/i.test(docs)
);
check(
  "docs mention installed sidecar health smoke",
  /installed sidecar health smoke|sidecar.*loopback/i.test(docs)
);
check(
  "docs mention one-click Windows preview release",
  /one-click Windows preview release|release:windows-preview/i.test(docs)
);
check(
  "docs mention GitHub prerelease publishing",
  /GitHub.*prerelease|prerelease.*GitHub/i.test(docs)
);
check(
  "docs mention Windows packaging smoke suite",
  /packaging smoke suite|smoke suite/i.test(docs)
);
check(
  "docs mention Windows packaging QA evidence",
  /packaging QA evidence|QA evidence manifest/i.test(docs)
);
check(
  "docs mention Windows manual GUI QA template",
  /manual GUI QA template|manual.*QA.*template/i.test(docs)
);
check(
  "docs mention Windows manual GUI QA handoff",
  /manual GUI QA handoff|verify:windows-manual-gui-qa-handoff/i.test(docs)
);
check(
  "docs mention handoff is surfaced in packaged diagnostics",
  /manual GUI QA handoff.*packaged|packaged.*manual GUI QA handoff/i.test(docs)
);
check(
  "docs mention Windows manual GUI QA result verifier",
  /manual GUI QA result verifier|verify:windows-manual-gui-qa-result/i.test(docs)
);
check(
  "docs mention Windows QA evidence manual result summary smoke",
  /manual result summary|qa evidence.*manual result|smoke:windows-packaging-qa-evidence-manual-result/i.test(
    docs
  )
);
check(
  "docs mention Windows RC gate manual result smoke",
  /RC gate.*manual result|manual result.*RC gate|smoke:windows-packaging-rc-gate-manual-result/i.test(
    docs
  )
);
check(
  "docs mention packaged manual GUI QA result summary",
  /manual GUI QA result.*packaged|packaged.*manual GUI QA result/i.test(docs)
);
check(
  "docs mention Windows packaging release readiness gate",
  /release readiness|verify:windows-packaging-release-readiness/i.test(docs)
);
check(
  "docs mention Windows packaging RC gate",
  /RC gate|verify:windows-packaging-rc-gate/i.test(docs)
);
check(
  "docs mention Windows RC gate full results smoke",
  /RC gate.*full.*results|full.*results.*RC gate|smoke:windows-packaging-rc-gate-full-results/i.test(
    docs
  )
);
check(
  "docs mention Windows RC status summary",
  /Windows RC status|RC status summary|windowsRcStatus/i.test(docs) &&
    /verify:windows-rc-status/i.test(docs)
);
check(
  "docs mention Windows release policy template",
  /release policy template|verify:windows-release-policy-template/i.test(docs)
);
check(
  "docs mention Windows sidecar production readiness template",
  /sidecar production readiness template|verify:windows-sidecar-production-readiness-template/i.test(
    docs
  )
);
check(
  "docs mention Windows sidecar production readiness result verifier",
  /sidecar production readiness result verifier|verify:windows-sidecar-production-readiness-result/i.test(
    docs
  )
);
check(
  "docs mention Windows RC gate sidecar readiness result smoke",
  /RC gate.*sidecar.*readiness|sidecar.*readiness.*RC gate|smoke:windows-packaging-rc-gate-sidecar-readiness-result/i.test(
    docs
  )
);
check(
  "docs mention Windows license review template",
  /license review template|verify:windows-license-review-template/i.test(docs)
);
check(
  "docs mention Windows license review result verifier",
  /license review result verifier|verify:windows-license-review-result/i.test(docs)
);
check(
  "docs mention Windows RC gate license review result smoke",
  /RC gate.*license review|license review.*RC gate|smoke:windows-packaging-rc-gate-license-review-result/i.test(
    docs
  )
);
check(
  "docs mention Windows code signing readiness template",
  /code signing readiness template|verify:windows-code-signing-readiness-template/i.test(docs)
);
check(
  "docs mention Windows code signing readiness result verifier",
  /code signing readiness result verifier|verify:windows-code-signing-readiness-result/i.test(docs)
);
check(
  "docs mention Windows RC gate code signing result smoke",
  /RC gate.*code signing|code signing.*RC gate|smoke:windows-packaging-rc-gate-code-signing-result/i.test(
    docs
  )
);
check(
  "docs mention Windows updater policy readiness template",
  /updater policy readiness template|verify:windows-updater-policy-readiness-template/i.test(docs)
);
check(
  "docs mention Windows updater policy readiness result verifier",
  /updater policy readiness result verifier|verify:windows-updater-policy-readiness-result/i.test(
    docs
  )
);
check(
  "docs mention Windows RC gate updater policy result smoke",
  /RC gate.*updater policy|updater policy.*RC gate|smoke:windows-packaging-rc-gate-updater-policy-result/i.test(
    docs
  )
);
check(
  "docs mention Windows release approval readiness template",
  /release approval readiness template|verify:windows-release-approval-readiness-template/i.test(
    docs
  )
);
check(
  "docs mention Windows release approval readiness result verifier",
  /release approval readiness result verifier|verify:windows-release-approval-readiness-result/i.test(
    docs
  )
);
check(
  "docs mention Windows RC gate release approval result smoke",
  /RC gate.*release approval|release approval.*RC gate|smoke:windows-packaging-rc-gate-release-approval-result/i.test(
    docs
  )
);
check(
  "docs mention Windows RC reviewer bundle",
  /RC reviewer bundle|verify:windows-rc-reviewer-bundle/i.test(docs)
);
check(
  "docs mention Windows release gate handoff",
  /release gate handoff|verify:windows-release-gate-handoff/i.test(docs)
);
check(
  "docs mention Windows release gate results intake",
  /release gate results|verify:windows-release-gate-results/i.test(docs)
);
check(
  "docs mention release gate results import workflow",
  /release gate results import|import:windows-release-gate-results|verify:windows-release-gate-results-import/i.test(
    docs
  )
);
check(
  "docs mention release gate results import in packaged diagnostics",
  /release gate results import.*packaged|packaged.*release gate results import|releaseGateResultsImport/i.test(docs)
);
check(
  "docs mention release gate results in packaged diagnostics",
  /release gate results.*packaged|packaged.*release gate results/i.test(docs)
);
check(
  "docs mention release gate partial result smoke",
  /partial.*release gate results|release gate results.*partial|smoke:windows-release-gate-results-partial/i.test(
    docs
  )
);
check(
  "docs mention release gate invalid result smoke",
  /invalid.*release gate results|release gate results.*invalid|smoke:windows-release-gate-results-invalid/i.test(
    docs
  )
);
check(
  "docs mention release gate results suite smoke",
  /release gate results.*suite|suite.*release gate results|smoke:windows-release-gate-results-suite/i.test(
    docs
  )
);
check(
  "docs mention release gate results suite in packaged diagnostics",
  /release gate results suite.*packaged|packaged.*release gate results suite/i.test(docs)
);
check(
  "docs mention Windows release result workspace",
  /release result workspace|verify:windows-release-result-workspace/i.test(docs)
);
check(
  "docs mention release result drafts cannot remove blockers",
  /drafts?.*cannot remove blockers|cannot remove blockers.*drafts?/i.test(docs)
);
check(
  "docs mention release result workspace in packaged diagnostics",
  /release result workspace.*packaged|packaged.*release result workspace/i.test(docs)
);
check(
  "docs mention Windows packaging manual GUI checklist",
  /manual GUI checklist|manual GUI QA/i.test(docs)
);
check(
  "docs mention no installer artifact for draft",
  /not.*installer|installer.*draft-only/i.test(docs)
);
check(
  "docs do not claim code signing complete",
  /not.*code signing complete|code signing.*not complete|not a signed release/i.test(docs)
);
check("docs do not claim updater complete", /no updater|updater.*not/i.test(docs));
check("docs do not claim new metrics", /no new metrics|does not add metrics/i.test(docs));

const manifestText = existsSync(resolve("apps/desktop/src-tauri/binaries/sidecar-manifest.json"))
  ? readText("apps/desktop/src-tauri/binaries/sidecar-manifest.json")
  : "{}";
const manifestIsSelfContained = /"artifactKind"\s*:\s*"self-contained"/.test(manifestText);
check(
  "manifest productionReady does not misreport",
  !/"productionReady"\s*:\s*true/.test(manifestText)
);
check(
  "manifest has artifactKind when present",
  manifestText === "{}" || /"artifactKind"/.test(manifestText)
);
check(
  "self-contained manifest records license review status",
  manifestText === "{}" || !manifestIsSelfContained || /"licenseReviewStatus"/.test(manifestText)
);
check(
  "self-contained manifest records packaging notices",
  manifestText === "{}" || !manifestIsSelfContained || /"noticesFile"/.test(manifestText)
);

const apiDocs = readText("docs/api.md");
const openapi = readText("docs/openapi.yaml");
check(
  "API docs mention packaged diagnostics export",
  /\/api\/packaged\/diagnostics\/export/.test(apiDocs)
);
check(
  "OpenAPI contains packaged diagnostics export path",
  /\/api\/packaged\/diagnostics\/export/.test(openapi)
);
check("OpenAPI mentions sidecar crash state", /sidecarCrashState/.test(openapi));
check(
  "OpenAPI mentions packaged storage migration status",
  /migrationVersions|sessionsCount|reportsCount/.test(openapi)
);
check("OpenAPI mentions manual GUI QA handoff", /manualGuiQaHandoff/.test(openapi));
check("OpenAPI mentions manual GUI QA result", /manualGuiQaResult/.test(openapi));
check("OpenAPI mentions Windows RC status", /windowsRcStatus/.test(openapi));
check("OpenAPI mentions release gate results", /releaseGateResults/.test(openapi));
check("OpenAPI mentions release gate results import", /releaseGateResultsImport/.test(openapi));
check("OpenAPI mentions release gate results suite", /releaseGateResultsSuite/.test(openapi));
check("OpenAPI mentions release result workspace", /releaseResultWorkspace/.test(openapi));

const sanitizerTests = readText("apps/local-server/test/packagedDiagnostics.test.ts");
check("sanitizer tests cover token redaction", /Bearer secret-token/.test(sanitizerTests));
check("sanitizer tests cover path redaction", /Windows path|C:\\\\Users/.test(sanitizerTests));

const crashTests = readText("apps/local-server/test/sidecarCrashRecovery.test.ts");
check("crash recovery tests cover cooldown", /cooldown/.test(crashTests));
check("crash recovery tests cover restart limit", /restart_limited/.test(crashTests));

const storageTests = readText("apps/local-server/test/packagedStorageStatus.test.ts");
check("packaged storage tests cover migrations", /migrationVersions/.test(storageTests));

if (process.exitCode === 1) {
  console.error("Packaging hardening verification failed");
} else {
  console.log("Packaging hardening verification passed");
}
