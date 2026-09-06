import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AndroidBetaChecklist } from "../src/components/AndroidBetaChecklist";
import { AndroidFallbackNotice } from "../src/components/AndroidFallbackNotice";
import { DiagnosticsTimeline } from "../src/components/DiagnosticsTimeline";
import { DiagnosticsExportButton } from "../src/components/DiagnosticsExportButton";
import { LocalServerStatusPanel } from "../src/components/LocalServerStatusPanel";
import { LogRotationPanel } from "../src/components/LogRotationPanel";
import { ManualGuiQaTemplatePanel } from "../src/components/ManualGuiQaTemplatePanel";
import { PackagingDiagnosticsExportButton } from "../src/components/PackagingDiagnosticsExportButton";
import { PackagingDiagnosticsPanel } from "../src/components/PackagingDiagnosticsPanel";
import { PackagingReleaseReadinessPanel } from "../src/components/PackagingReleaseReadinessPanel";
import { PackagingRcGatePanel } from "../src/components/PackagingRcGatePanel";
import { PackagingToolchainPanel } from "../src/components/PackagingToolchainPanel";
import { PackagedStorageSmokePanel } from "../src/components/PackagedStorageSmokePanel";
import { PackagedStorageStatusPanel } from "../src/components/PackagedStorageStatusPanel";
import { ReleaseGateResultsPanel } from "../src/components/ReleaseGateResultsPanel";
import { ReleaseResultWorkspacePanel } from "../src/components/ReleaseResultWorkspacePanel";
import { SidecarCrashRecoveryPanel } from "../src/components/SidecarCrashRecoveryPanel";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Android diagnostics UI", () => {
  it("shows beta checklist and fallback notices without raw serials", () => {
    render(
      <>
        <AndroidBetaChecklist />
        <AndroidFallbackNotice
          metrics={[
            {
              sessionId: "s",
              timestampMs: 1,
              deviceId: "android:<device-serial>",
              targetId: "t",
              metricName: "network_rx_bytes",
              value: 1,
              unit: "bytes",
              source: "adb:/proc/net/dev",
              precision: "device_level",
              confidence: "low",
              tags: { scope: "device" }
            }
          ]}
          diagnostics={[{ category: "fps", message: "FPS layer match ambiguous" }]}
        />
      </>
    );

    expect(screen.getByText(/logcat or bugreport/)).toBeTruthy();
    expect(screen.getAllByText(/Device-level network counters/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Android FPS detection is experimental/)).toBeTruthy();
  });

  it("renders diagnostics timeline and export controls", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: true, data: "diagnostics" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
    );
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:diagnostics")
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(() => undefined)
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    render(
      <>
        <DiagnosticsTimeline
          diagnostics={[
            {
              id: "d1",
              timestampMs: 1,
              level: "warn",
              category: "process",
              message: "PID rebound",
              details: { androidCode: "PID_REBOUND" }
            }
          ]}
        />
        <DiagnosticsExportButton sessionId="s1" />
      </>
    );

    expect(screen.getByText("PID rebound")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export diagnostics JSON" })).toBeTruthy();
  });

  it("renders sidecar status without exposing token or raw paths", () => {
    render(
      <>
        <LocalServerStatusPanel
          packagedStatus={{
            packaged: true,
            host: "127.0.0.1",
            port: 49152,
            artifactKind: "dev-wrapper",
            sidecarManifest: {
              valid: true,
              fileName: "lumatrace-local-server-x86_64-pc-windows-msvc.cmd",
              targetTriple: "x86_64-pc-windows-msvc",
              artifactKind: "dev-wrapper",
              productionReady: false,
              nodeRequired: true,
              sizeBytes: 10,
              sha256: "hash",
              limitations: ["Development wrapper is not production ready."]
            },
            dataDir: "<user-path>/LumaTrace",
            logsDir: "<user-path>/LumaTrace/logs",
            authRequired: true,
            storage: {
              dbExists: true,
              migrationStatus: "ok",
              dbPathSanitized: "<user-path>/LumaTrace/lumatrace.db",
              dbSizeBytes: 4096,
              migrationVersions: ["001_initial"],
              sessionsCount: 2,
              reportsCount: 1,
              reportsDirExists: true,
              diagnosticsDirExists: true,
              writable: true
            },
            sidecarCrashState: {
              status: "port_conflict",
              restartCount: 1,
              maxRestarts: 3,
              restartCooldownMs: 5000,
              lastCrashReason: {
                reasonCode: "port_conflict",
                userMessage: "The local-server sidecar could not bind its localhost port.",
                suggestedAction: "Restart after closing the process that owns the port.",
                severity: "error",
                sanitizedEvidence: "EADDRINUSE <redacted> <local-path>"
              }
            },
            logs: {
              logsDirSanitized: "<user-path>/LumaTrace/logs",
              logFiles: [{ name: "sidecar-supervisor.log", sizeBytes: 42, rotated: false }],
              rotationPolicy: { maxFileSizeBytes: 10485760, maxFiles: 5 }
            },
            limitations: {
              productionReady: false,
              codeSigningConfigured: false,
              updaterConfigured: false
            },
            uptimeMs: 1000
          }}
          sidecarStatus={{
            status: "port_conflict",
            restartCount: 1,
            maxRestarts: 3,
            lastExitCode: 1,
            artifactKind: "dev-wrapper",
            productionReady: false,
            lastError: "port conflict",
            lastStderrExcerptSanitized: "EADDRINUSE <token> <user-path>",
            lastCrashReason: {
              reasonCode: "port_conflict",
              userMessage: "The local-server sidecar could not bind its localhost port.",
              suggestedAction: "Restart after closing the process that owns the port.",
              severity: "error"
            },
            message: "local-server exited"
          }}
        />
        <SidecarCrashRecoveryPanel
          status={{
            status: "restart_limited",
            restartCount: 3,
            maxRestarts: 3,
            restartCooldownMs: 5000,
            lastError: "restart limit reached"
          }}
        />
        <PackagedStorageStatusPanel
          status={{
            packaged: true,
            host: "127.0.0.1",
            port: 49152,
            authRequired: true,
            uptimeMs: 1000,
            storage: {
              dbExists: true,
              migrationStatus: "ok",
              dbPathSanitized: "<user-path>/LumaTrace/lumatrace.db",
              migrationVersions: ["001_initial"],
              sessionsCount: 2,
              reportsCount: 1,
              reportsDirExists: true,
              diagnosticsDirExists: true
            }
          }}
        />
        <PackagedStorageSmokePanel />
        <PackagingReleaseReadinessPanel
          status={{
            packaged: true,
            host: "127.0.0.1",
            port: 49152,
            authRequired: true,
            uptimeMs: 1000,
            releaseReadiness: {
              exists: true,
              valid: true,
              fileName: "lumatrace-windows-packaging-release-readiness.json",
              releaseStatus: "blocked",
              qaDraftStatus: "automated_ready_manual_pending",
              productionReady: false,
              blockers: [
                {
                  code: "CODE_SIGNING_NOT_CONFIGURED",
                  reason: "Windows production code signing is not configured or verified.",
                  requiredForProduction: true
                },
                {
                  code: "UPDATER_NOT_CONFIGURED",
                  reason: "Updater policy and update signing are not configured.",
                  requiredForProduction: true
                }
              ]
            }
          }}
        />
        <PackagingRcGatePanel
          status={{
            packaged: true,
            host: "127.0.0.1",
            port: 49152,
            authRequired: true,
            uptimeMs: 1000,
            rcGate: {
              exists: true,
              valid: true,
              fileName: "lumatrace-windows-packaging-rc-gate.json",
              status: "blocked",
              rcCandidateReady: false,
              productionReady: false,
              unsignedDraft: true,
              gates: [
                {
                  id: "code_signing",
                  label: "Windows code signing",
                  status: "blocked",
                  requiredForRelease: true,
                  reason: "Code signing certificate, signing command, and verification policy are not configured."
                }
              ],
              blockers: [
                {
                  code: "CODE_SIGNING",
                  gateId: "code_signing",
                  reason: "Code signing certificate, signing command, and verification policy are not configured.",
                  requiredForRelease: true
                }
              ]
            }
          }}
        />
        <ReleaseGateResultsPanel
          status={{
            packaged: true,
            host: "127.0.0.1",
            port: 49152,
            authRequired: true,
            uptimeMs: 1000,
            releaseGateResults: {
              exists: true,
              valid: true,
              fileName: "lumatrace-windows-release-gate-results-intake.json",
              status: "no_results",
              rcCandidateReady: false,
              productionReady: false,
              resultSummary: {
                total: 6,
                valid: 0,
                invalid: 0,
                missing: 6
              },
              results: [
                {
                  gate: "code_signing",
                  blockerCode: "CODE_SIGNING",
                  resultFile: "lumatrace-windows-code-signing-readiness-result.json",
                  templateFile: "lumatrace-windows-code-signing-readiness-template.json",
                  status: "missing_result",
                  canRemoveBlocker: false,
                  verifierCommand: "pnpm verify:windows-code-signing-readiness-result path/to/result.json",
                  rcGateSmokeCommand: "pnpm smoke:windows-packaging-rc-gate-code-signing-result",
                  reason: "Result is missing."
                }
              ]
            }
          }}
        />
        <ReleaseResultWorkspacePanel
          status={{
            packaged: true,
            host: "127.0.0.1",
            port: 49152,
            authRequired: true,
            uptimeMs: 1000,
            releaseResultWorkspace: {
              exists: true,
              valid: true,
              fileName: "lumatrace-windows-release-result-workspace-manifest.json",
              status: "workspace_ready",
              rcCandidateReady: false,
              productionReady: false,
              workspaceDirectory: "lumatrace-windows-release-result-workspace",
              currentIntake: {
                exists: true,
                status: "no_results",
                validResults: 0,
                invalidResults: 0,
                missingResults: 6
              },
              gateSummary: {
                total: 6,
                requiresHumanReview: 6
              },
              draftSummary: {
                total: 6,
                cannotRemoveBlockers: 6
              },
              fileSummary: {
                total: 14,
                templates: 6,
                drafts: 6
              },
              gateActions: [
                {
                  gate: "code_signing",
                  blockerCode: "CODE_SIGNING",
                  templateFile: "lumatrace-windows-code-signing-readiness-template.json",
                  resultFile: "lumatrace-windows-code-signing-readiness-result.json",
                  verifierCommand: "pnpm verify:windows-code-signing-readiness-result path/to/result.json",
                  rcGateSmokeCommand: "pnpm smoke:windows-packaging-rc-gate-code-signing-result",
                  requiresHumanReview: true
                }
              ],
              drafts: [
                {
                  gate: "code_signing",
                  blockerCode: "CODE_SIGNING",
                  draftFile: "lumatrace-windows-code-signing-readiness-result.json.draft.json",
                  expectedResultFile: "lumatrace-windows-code-signing-readiness-result.json",
                  sourceTemplateFile: "lumatrace-windows-code-signing-readiness-template.json",
                  verifierCommand: "pnpm verify:windows-code-signing-readiness-result path/to/result.json",
                  rcGateSmokeCommand: "pnpm smoke:windows-packaging-rc-gate-code-signing-result",
                  canRemoveBlocker: false
                }
              ],
              instructions: ["Draft files are intentionally not valid release results."],
              securityAssertions: {
                tokenRedacted: true,
                rawLogsExcluded: true
              }
            }
          }}
        />
        <PackagingToolchainPanel
          status={{
            rustAvailable: false,
            tauriCliAvailable: false,
            platform: "win32",
            arch: "x64",
            canRunTauriDev: false,
            canRunTauriBuild: false,
            missingTools: ["rust", "tauri-cli"],
            suggestedActions: ["Install Rust with rustup."]
          }}
        />
        <ManualGuiQaTemplatePanel />
        <PackagingDiagnosticsPanel
          diagnostics={JSON.stringify(
            {
              logs: "<user-path>/LumaTrace/logs",
              secrets: "<redacted>",
              releaseReadiness: {
                releaseStatus: "blocked",
                qaDraftStatus: "automated_ready_manual_pending",
                blockers: [{ code: "CODE_SIGNING_NOT_CONFIGURED" }]
              },
              rcGate: {
                status: "blocked",
                blockers: [{ code: "CODE_SIGNING" }]
              }
            },
            null,
            2
          )}
        />
        <LogRotationPanel
          status={{
            packaged: true,
            host: "127.0.0.1",
            port: 49152,
            authRequired: true,
            uptimeMs: 1000,
            logs: {
              logsDirSanitized: "<user-path>/LumaTrace/logs",
              logFiles: [
                {
                  name: "local-server.log",
                  sizeBytes: 42,
                  rotated: false,
                  excerpt: "auth=<redacted> path=<local-path>"
                }
              ],
              rotationPolicy: {
                maxFileSizeBytes: 10485760,
                maxFiles: 5,
                rotateOnStartup: true,
                rotateWhenThresholdExceeded: true,
                deleteOldest: true
              },
              lastRotationResult: {
                ok: true,
                rotatedFiles: [],
                warnings: []
              }
            }
          }}
        />
        <PackagingDiagnosticsExportButton onExport={() => undefined} />
      </>
    );

    expect(screen.getByText("mode: packaged")).toBeTruthy();
    expect(screen.getByText("sidecar: port_conflict")).toBeTruthy();
    expect(screen.getByText("crash state: restart_limited")).toBeTruthy();
    expect(screen.getByText(/restart limit reached/)).toBeTruthy();
    expect(screen.getByText("auth: required")).toBeTruthy();
    expect(screen.getAllByText("artifact: dev-wrapper").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/production: not ready/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Missing tools: rust, tauri-cli/)).toBeTruthy();
    expect(screen.getByText("template: pending")).toBeTruthy();
    expect(screen.getByText("manual GUI QA: not run")).toBeTruthy();
    expect(screen.getByText(/verify:windows-manual-gui-qa-template/)).toBeTruthy();
    expect(screen.getByText(/verify:windows-manual-gui-qa-result/)).toBeTruthy();
    expect(screen.getByText(/smoke:windows-packaging-qa-evidence-manual-result/)).toBeTruthy();
    expect(screen.getByText(/"secrets": "<redacted>"/)).toBeTruthy();
    expect(screen.getAllByText(/Raw logs/).length).toBeGreaterThan(0);
    expect(screen.getByText(/local-server.log/)).toBeTruthy();
    expect(screen.getByText(/db exists; migrations ok; 2 sessions; 1 reports/)).toBeTruthy();
    expect(screen.getByText(/same database path/)).toBeTruthy();
    expect(screen.getAllByText("release: blocked").length).toBeGreaterThan(0);
    expect(screen.getAllByText("RC: blocked").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Release Gate Results/).length).toBeGreaterThan(0);
    expect(screen.getByText(/workspace: present/)).toBeTruthy();
    expect(screen.getByText(/Cannot remove blockers/)).toBeTruthy();
    expect(screen.getByText(/verify:windows-release-result-workspace/)).toBeTruthy();
    expect(screen.getAllByText(/CODE_SIGNING_NOT_CONFIGURED/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/CODE_SIGNING/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Refresh packaging diagnostics" })).toBeTruthy();
    expect(screen.queryByText(/Bearer/)).toBeNull();
  });
});
