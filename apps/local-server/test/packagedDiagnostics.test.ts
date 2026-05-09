import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getDevWrapperSidecarFileName,
  getSelfContainedSidecarFileName,
  getSidecarTargetTriple,
  readSidecarManifest
} from "../src/diagnostics/packagedDiagnostics";
import { collectLogMetadata, rotateLogs, sanitizeLogExcerpt } from "../src/diagnostics/logMetadata";
import {
  buildPackagingNoticeManifest,
  renderThirdPartyNoticesMarkdown
} from "../src/diagnostics/packagingNotices";
import { readPackagingReleaseReadiness } from "../src/diagnostics/packagingReleaseReadiness";
import { readPackagingManualGuiQaHandoff } from "../src/diagnostics/packagingManualGuiQaHandoff";
import { readPackagingManualGuiQaResult } from "../src/diagnostics/packagingManualGuiQaResult";
import { readPackagingReleaseGateResults } from "../src/diagnostics/packagingReleaseGateResults";
import { readPackagingReleaseGateResultsImport } from "../src/diagnostics/packagingReleaseGateResultsImport";
import { readPackagingReleaseGateResultsSuite } from "../src/diagnostics/packagingReleaseGateResultsSuite";
import { readPackagingReleaseResultWorkspace } from "../src/diagnostics/packagingReleaseResultWorkspace";
import { buildWindowsRcStatus } from "../src/diagnostics/packagingWindowsRcStatus";
import { sanitizePackagedDiagnostics } from "../src/diagnostics/sanitizePackagedDiagnostics";

describe("packaged diagnostics", () => {
  it("maps platform and arch to sidecar target names", () => {
    expect(getSidecarTargetTriple("win32", "x64")).toBe("x86_64-pc-windows-msvc");
    expect(getSelfContainedSidecarFileName("win32", "x64")).toBe(
      "lumatrace-local-server-x86_64-pc-windows-msvc.exe"
    );
    expect(getDevWrapperSidecarFileName("darwin", "arm64")).toBe(
      "lumatrace-local-server-aarch64-apple-darwin"
    );
  });

  it("validates manifest hash and production readiness", () => {
    const root = mkdtempSync(join(tmpdir(), "lumatrace-manifest-test-"));
    mkdirSync(root, { recursive: true });
    const fileName = "lumatrace-local-server-x86_64-pc-windows-msvc.cmd";
    const artifactText = "@echo off\r\n";
    writeFileSync(join(root, fileName), artifactText, "utf8");
    const manifestPath = join(root, "sidecar-manifest.json");
    writeFileSync(
      manifestPath,
      JSON.stringify({
        name: "lumatrace-local-server",
        version: "0.0.0",
        artifactKind: "dev-wrapper",
        platform: "win32",
        arch: "x64",
        targetTriple: "x86_64-pc-windows-msvc",
        fileName,
        sizeBytes: Buffer.byteLength(artifactText),
        sha256: createHash("sha256").update(artifactText).digest("hex"),
        buildTime: new Date(0).toISOString(),
        sourcePackageVersion: "0.0.0",
        nodeRequired: true,
        productionReady: false,
        limitations: ["not production ready"]
      }),
      "utf8"
    );

    const validation = readSidecarManifest(manifestPath);
    expect(validation.valid).toBe(true);
    expect(validation.manifest?.artifactKind).toBe("dev-wrapper");
    expect(validation.manifest?.productionReady).toBe(false);
  });

  it("rotates oversized logs and keeps max files", () => {
    const root = mkdtempSync(join(tmpdir(), "lumatrace-log-rotation-test-"));
    writeFileSync(join(root, "local-server.log"), "x".repeat(20), "utf8");
    writeFileSync(join(root, "local-server.log.1"), "old1", "utf8");
    writeFileSync(join(root, "local-server.log.2"), "old2", "utf8");

    const result = rotateLogs(root, {
      maxFileSizeBytes: 4,
      maxFiles: 2,
      rotateOnStartup: true,
      rotateWhenThresholdExceeded: true,
      deleteOldest: true
    });

    expect(result.ok).toBe(true);
    expect(result.rotatedFiles).toContain("local-server.log");
    expect(existsSync(join(root, "local-server.log.3"))).toBe(false);
    expect(collectLogMetadata(root).map((entry) => entry.name)).toEqual(
      expect.arrayContaining(["local-server.log", "local-server.log.1", "local-server.log.2"])
    );
  });

  it("sanitizes tokens, paths, long text, stacks, and command arrays", () => {
    const sanitized = sanitizePackagedDiagnostics({
      authorization: "Bearer secret-token-123456789",
      protocol: "lumatrace-auth.websocket-secret-token",
      email: "user@example.com",
      path: "C:\\Users\\Alice\\AppData\\Local\\LumaTrace\\local-server.log",
      csvPath: "/Users/alice/PresentMon/capture.csv",
      command: ["node", "--auth-token", "secret-token-123456789"],
      stack: "Error: boom\n    at run (C:\\Users\\Alice\\repo\\file.ts:10:1)",
      stdout: "x".repeat(5000),
      nested: {
        commandLine: "app.exe --token secret-token-123456789"
      }
    });

    const text = JSON.stringify(sanitized);
    expect(text).not.toContain("secret-token-123456789");
    expect(text).not.toContain("user@example.com");
    expect(text).not.toContain("C:\\Users\\Alice");
    expect(text).not.toContain("/Users/alice");
    expect(text).not.toContain("file.ts:10");
    expect(text).toContain("<redacted>");
    expect(text).toContain("<local-path>");
    expect(text).toContain("<truncated>");
  });

  it("sanitizes log excerpts without returning raw paths", () => {
    const excerpt = sanitizeLogExcerpt(
      "Bearer secret-token-123456789 C:\\Users\\Alice\\LumaTrace\\log.txt\n" + "x".repeat(5000)
    );
    expect(excerpt).not.toContain("secret-token-123456789");
    expect(excerpt).not.toContain("C:\\Users\\Alice");
    expect(excerpt.length).toBeLessThanOrEqual(4096);
  });

  it("builds packaging notices from bundled runtime dependencies", () => {
    const root = mkdtempSync(join(tmpdir(), "lumatrace-notices-test-"));
    const nodeModules = join(root, "node_modules");
    mkdirSync(join(nodeModules, "fastify"), { recursive: true });
    writeFileSync(
      join(nodeModules, "fastify", "package.json"),
      JSON.stringify({
        name: "fastify",
        version: "5.2.1",
        license: "MIT"
      }),
      "utf8"
    );
    writeFileSync(join(nodeModules, "fastify", "LICENSE"), "MIT license text", "utf8");
    mkdirSync(join(nodeModules, "@lumatrace", "core"), { recursive: true });
    writeFileSync(
      join(nodeModules, "@lumatrace", "core", "package.json"),
      JSON.stringify({
        name: "@lumatrace/core",
        version: "0.0.0",
        private: true
      }),
      "utf8"
    );

    const manifest = buildPackagingNoticeManifest({
      runtimeAppDir: root,
      bundledNodeVersion: "v24.14.1",
      artifactKind: "self-contained",
      productionReady: false,
      generatedAt: new Date(0).toISOString()
    });

    expect(manifest.productionReady).toBe(false);
    expect(manifest.licenseReviewStatus).toBe("draft_requires_review");
    expect(manifest.bundledRuntime.name).toBe("Node.js");
    expect(manifest.entries.some((entry) => entry.name === "fastify" && entry.license === "MIT")).toBe(true);
    expect(manifest.entries.some((entry) => entry.name === "@lumatrace/core" && entry.private === true)).toBe(true);
    expect(manifest.summary.packageCount).toBe(2);
    expect(manifest.summary.missingLicenseCount).toBe(1);

    const markdown = renderThirdPartyNoticesMarkdown(manifest);
    expect(markdown).toContain("Production ready: false");
    expect(markdown).toContain("| fastify | 5.2.1 | npm-package | MIT | recorded |");
  });

  it("reads sanitized packaging release readiness blockers", () => {
    const root = mkdtempSync(join(tmpdir(), "lumatrace-release-readiness-test-"));
    const manifestPath = join(root, "sidecar-manifest.json");
    writeFileSync(
      join(root, "lumatrace-windows-packaging-release-readiness.json"),
      JSON.stringify({
        evidenceKind: "windows-packaging-release-readiness",
        productionReady: false,
        releaseStatus: "blocked",
        qaDraftStatus: "automated_ready_manual_pending",
        blockers: [
          {
            code: "CODE_SIGNING_NOT_CONFIGURED",
            reason: "C:\\Users\\Alice\\secret path should be redacted",
            requiredForProduction: true
          }
        ],
        checks: {
          codeSigningConfigured: false,
          updaterConfigured: false
        }
      }),
      "utf8"
    );
    writeFileSync(manifestPath, "{}", "utf8");

    const readiness = readPackagingReleaseReadiness(manifestPath);
    expect(readiness.exists).toBe(true);
    expect(readiness.valid).toBe(true);
    expect(readiness.releaseStatus).toBe("blocked");
    expect(readiness.productionReady).toBe(false);
    expect(readiness.blockers?.[0]?.code).toBe("CODE_SIGNING_NOT_CONFIGURED");
    expect(readiness.blockers?.[0]?.reason).not.toContain("C:\\Users\\Alice");
  });

  it("reads sanitized manual GUI QA handoff summary without reviewer results", () => {
    const root = mkdtempSync(join(tmpdir(), "lumatrace-manual-gui-qa-handoff-test-"));
    const manifestPath = join(root, "sidecar-manifest.json");
    writeFileSync(
      join(root, "lumatrace-windows-manual-gui-qa-handoff-manifest.json"),
      JSON.stringify({
        evidenceKind: "windows-manual-gui-qa-handoff",
        status: "handoff_ready",
        productionReady: false,
        unsignedDraft: true,
        manualGuiQaStatus: "not_run",
        handoffDirectory: "lumatrace-windows-manual-gui-qa-handoff",
        files: [
          {
            role: "pending manual QA template",
            fileName: "lumatrace-windows-manual-gui-qa-template.json",
            sha256: "a".repeat(64),
            sizeBytes: 100
          }
        ],
        excludedFiles: ["lumatrace-windows-manual-gui-qa-result.json", "raw logs", "auth token"],
        securityAssertions: {
          tokenRedacted: true,
          rawLogsExcluded: true,
          fullLocalPathsRedacted: true,
          secretPath: "C:\\Users\\Alice\\LumaTrace\\secret.log"
        },
        limitations: ["productionReady remains false."]
      }),
      "utf8"
    );
    writeFileSync(manifestPath, "{}", "utf8");

    const handoff = readPackagingManualGuiQaHandoff(manifestPath);
    const text = JSON.stringify(handoff);
    expect(handoff.exists).toBe(true);
    expect(handoff.valid).toBe(true);
    expect(handoff.status).toBe("handoff_ready");
    expect(handoff.manualGuiQaStatus).toBe("not_run");
    expect(handoff.productionReady).toBe(false);
    expect(handoff.fileCount).toBe(1);
    expect(handoff.excludedFiles).toContain("lumatrace-windows-manual-gui-qa-result.json");
    expect(text).not.toContain("C:\\Users\\Alice");
    expect(text).not.toContain("secret.log");
  });

  it("reports missing manual GUI QA result without failing packaged diagnostics", () => {
    const root = mkdtempSync(join(tmpdir(), "lumatrace-manual-gui-qa-result-missing-test-"));
    const manifestPath = join(root, "sidecar-manifest.json");
    writeFileSync(manifestPath, "{}", "utf8");

    const result = readPackagingManualGuiQaResult(manifestPath);
    expect(result.exists).toBe(false);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("missing");
  });

  it("reads sanitized manual GUI QA result summary without reviewer notes", () => {
    const root = mkdtempSync(join(tmpdir(), "lumatrace-manual-gui-qa-result-test-"));
    const manifestPath = join(root, "sidecar-manifest.json");
    writeFileSync(
      join(root, "lumatrace-windows-manual-gui-qa-result.json"),
      JSON.stringify({
        evidenceKind: "windows-manual-gui-qa-result",
        status: "passed",
        productionReady: false,
        unsignedDraft: true,
        sourceChecklist: {
          path: "docs/windows-packaging-manual-gui-checklist.md",
          itemCount: 2
        },
        reviewer: {
          name: "QA Reviewer",
          completedAt: "2026-04-30T00:00:00.000Z",
          environment: "C:\\Users\\Alice\\secret-lab"
        },
        steps: [
          {
            id: "startup",
            status: "passed",
            evidenceNote: "Saw the app start from C:\\Users\\Alice\\Desktop.",
            reviewerNote: "Looks good."
          },
          {
            id: "shutdown",
            status: "passed",
            evidenceNote: "Sidecar stopped cleanly.",
            reviewerNote: "Looks good."
          }
        ],
        securityAssertions: {
          tokenRedactionRequired: true,
          fullLocalPathRedactionRequired: true,
          rawLogsExcluded: true,
          stackTracesExcluded: true,
          publicSidecarListenersAllowed: false,
          localPathEvidence: "C:\\Users\\Alice\\LumaTrace\\app.log"
        },
        limitations: ["productionReady remains false."]
      }),
      "utf8"
    );
    writeFileSync(manifestPath, "{}", "utf8");

    const result = readPackagingManualGuiQaResult(manifestPath);
    const text = JSON.stringify(result);
    expect(result.exists).toBe(true);
    expect(result.valid).toBe(true);
    expect(result.status).toBe("passed");
    expect(result.productionReady).toBe(false);
    expect(result.reviewer).toEqual({
      namePresent: true,
      completedAtPresent: true,
      environmentPresent: true
    });
    expect(result.stepSummary).toMatchObject({
      total: 2,
      passed: 2,
      failed: 0,
      blocked: 0,
      pending: 0,
      unknown: 0
    });
    expect(text).not.toContain("QA Reviewer");
    expect(text).not.toContain("Looks good");
    expect(text).not.toContain("C:\\Users\\Alice");
    expect(text).not.toContain("secret-lab");
  });

  it("flags pending manual GUI QA result steps as invalid", () => {
    const root = mkdtempSync(join(tmpdir(), "lumatrace-manual-gui-qa-result-invalid-test-"));
    const manifestPath = join(root, "sidecar-manifest.json");
    writeFileSync(
      join(root, "lumatrace-windows-manual-gui-qa-result.json"),
      JSON.stringify({
        evidenceKind: "windows-manual-gui-qa-result",
        status: "passed",
        productionReady: false,
        unsignedDraft: true,
        sourceChecklist: {
          path: "docs/windows-packaging-manual-gui-checklist.md",
          itemCount: 1
        },
        reviewer: {
          name: "QA Reviewer",
          completedAt: "2026-04-30T00:00:00.000Z",
          environment: "Synthetic"
        },
        steps: [
          {
            id: "startup",
            status: "pending"
          }
        ]
      }),
      "utf8"
    );
    writeFileSync(manifestPath, "{}", "utf8");

    const result = readPackagingManualGuiQaResult(manifestPath);
    expect(result.exists).toBe(true);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("pending");
    expect(result.stepSummary?.pending).toBe(1);
  });

  it("reads sanitized release gate results intake without verifier output or reviewer notes", () => {
    const root = mkdtempSync(join(tmpdir(), "lumatrace-release-gate-results-test-"));
    const manifestPath = join(root, "sidecar-manifest.json");
    writeFileSync(
      join(root, "lumatrace-windows-release-gate-results-intake.json"),
      JSON.stringify({
        evidenceKind: "windows-release-gate-results-intake",
        status: "partial_results",
        rcCandidateReady: false,
        productionReady: false,
        unsignedDraft: true,
        currentRcBlockers: ["MANUAL_GUI_QA", "CODE_SIGNING"],
        results: [
          {
            gate: "manual_gui_qa",
            blockerCode: "MANUAL_GUI_QA",
            resultFile: "lumatrace-windows-manual-gui-qa-result.json",
            templateFile: "lumatrace-windows-manual-gui-qa-template.json",
            status: "valid_result",
            canRemoveBlocker: true,
            verifierCommand: "pnpm verify:windows-manual-gui-qa-result path/to/result.json",
            rcGateSmokeCommand: "pnpm smoke:windows-packaging-rc-gate-manual-result",
            sha256: "a".repeat(64),
            sizeBytes: 100,
            reason: "Result file passed its dedicated verifier."
          },
          {
            gate: "code_signing",
            blockerCode: "CODE_SIGNING",
            resultFile: "lumatrace-windows-code-signing-readiness-result.json",
            templateFile: "lumatrace-windows-code-signing-readiness-template.json",
            status: "missing_result",
            canRemoveBlocker: false,
            verifierCommand: "pnpm verify:windows-code-signing-readiness-result path/to/result.json",
            rcGateSmokeCommand: "pnpm smoke:windows-packaging-rc-gate-code-signing-result",
            reason: "No result file is present in C:\\Users\\Alice\\release."
          }
        ],
        nextCommands: ["Run pnpm verify:windows-release-gate-results"],
        securityAssertions: {
          tokenRedacted: true,
          fullLocalPathsRedacted: true,
          rawVerifierOutputExcluded: true,
          rawLogsExcluded: true,
          reviewerNotesExcluded: true,
          publicSidecarListenersAllowed: false,
          secretPath: "C:\\Users\\Alice\\LumaTrace\\secret.log"
        },
        limitations: ["productionReady remains false."]
      }),
      "utf8"
    );
    writeFileSync(manifestPath, "{}", "utf8");

    const results = readPackagingReleaseGateResults(manifestPath);
    const text = JSON.stringify(results);
    expect(results.exists).toBe(true);
    expect(results.valid).toBe(true);
    expect(results.status).toBe("partial_results");
    expect(results.productionReady).toBe(false);
    expect(results.resultSummary).toMatchObject({
      total: 2,
      valid: 1,
      invalid: 0,
      missing: 1
    });
    expect(results.results?.[0]?.canRemoveBlocker).toBe(true);
    expect(results.results?.[1]?.canRemoveBlocker).toBe(false);
    expect(text).not.toContain("C:\\Users\\Alice");
    expect(text).not.toContain("secret.log");
    expect(text).not.toContain("stdout");
    expect(text).not.toContain("stderr");
  });

  it("reads sanitized release gate results suite smoke manifest", () => {
    const root = mkdtempSync(join(tmpdir(), "lumatrace-release-gate-results-suite-test-"));
    const manifestPath = join(root, "sidecar-manifest.json");
    writeFileSync(
      join(root, "lumatrace-windows-release-gate-results-suite-smoke-manifest.json"),
      JSON.stringify({
        schemaVersion: 1,
        generatedAt: new Date(0).toISOString(),
        status: "success",
        suiteKind: "windows-release-gate-results-suite",
        productionReady: false,
        rcCandidateReady: false,
        unsigned: true,
        cases: [
          { name: "no_results", status: "passed", expectedIntakeStatus: "no_results" },
          { name: "partial_results", status: "passed", expectedIntakeStatus: "partial_results" },
          { name: "invalid_results", status: "passed", expectedIntakeStatus: "invalid_results" },
          { name: "all_results_valid", status: "passed", expectedIntakeStatus: "all_results_valid" }
        ],
        restoredPreviousFiles: true,
        securityAssertions: {
          tokenRedacted: true,
          rawLogsExcluded: true,
          fullLocalPathsRedacted: true,
          secretPath: "C:\\Users\\Alice\\LumaTrace\\secret.log"
        },
        limitations: ["Synthetic smoke evidence only."]
      }),
      "utf8"
    );
    writeFileSync(manifestPath, "{}", "utf8");

    const suite = readPackagingReleaseGateResultsSuite(manifestPath);
    const text = JSON.stringify(suite);
    expect(suite.exists).toBe(true);
    expect(suite.valid).toBe(true);
    expect(suite.status).toBe("success");
    expect(suite.productionReady).toBe(false);
    expect(suite.rcCandidateReady).toBe(false);
    expect(suite.restoredPreviousFiles).toBe(true);
    expect(suite.caseSummary).toMatchObject({
      total: 4,
      passed: 4,
      failed: 0,
      unknown: 0
    });
    expect(text).not.toContain("C:\\Users\\Alice");
    expect(text).not.toContain("secret.log");
    expect(text).not.toContain("stdout");
    expect(text).not.toContain("stderr");
  });

  it("reads sanitized release gate results import manifest without source paths or verifier output", () => {
    const root = mkdtempSync(join(tmpdir(), "lumatrace-release-gate-results-import-test-"));
    const manifestPath = join(root, "sidecar-manifest.json");
    writeFileSync(
      join(root, "lumatrace-windows-release-gate-results-import-manifest.json"),
      JSON.stringify({
        schemaVersion: 1,
        generatedAt: new Date(0).toISOString(),
        evidenceKind: "windows-release-gate-results-import",
        status: "mixed_results",
        sourceDirectoryKind: "custom_results_dir",
        dryRun: false,
        rcCandidateReady: false,
        productionReady: false,
        unsignedDraft: true,
        importSummary: {
          total: 2,
          valid: 1,
          invalid: 1,
          missing: 0,
          copied: 1
        },
        results: [
          {
            gate: "manual_gui_qa",
            blockerCode: "MANUAL_GUI_QA",
            resultFile: "lumatrace-windows-manual-gui-qa-result.json",
            templateFile: "lumatrace-windows-manual-gui-qa-template.json",
            sourceFile: "lumatrace-windows-manual-gui-qa-result.json",
            status: "valid_imported",
            copied: true,
            verifierCommand: "pnpm verify:windows-manual-gui-qa-result path/to/result.json",
            rcGateSmokeCommand: "pnpm smoke:windows-packaging-rc-gate-manual-result",
            sha256: "a".repeat(64),
            sizeBytes: 100,
            verifierExitCode: 0,
            reason: "Copied from C:\\Users\\Alice\\release-drop."
          },
          {
            gate: "license_notice_review",
            blockerCode: "LICENSE_NOTICE_REVIEW",
            resultFile: "lumatrace-windows-license-review-result.json",
            templateFile: "lumatrace-windows-license-review-template.json",
            sourceFile: "lumatrace-windows-license-review-result.json",
            status: "invalid_rejected",
            copied: false,
            verifierCommand: "pnpm verify:windows-license-review-result path/to/result.json",
            rcGateSmokeCommand: "pnpm smoke:windows-packaging-rc-gate-license-review-result",
            sha256: "b".repeat(64),
            sizeBytes: 100,
            verifierExitCode: 1,
            reason: "Verifier failed; stdout and stderr are excluded."
          }
        ],
        ignoredFiles: ["notes.txt"],
        refreshedIntake: {
          fileName: "lumatrace-windows-release-gate-results-intake.json",
          status: "partial_results",
          validResults: 1,
          invalidResults: 0,
          missingResults: 5
        },
        nextCommands: ["Run pnpm verify:windows-release-gate-results-import"],
        securityAssertions: {
          tokenRedacted: true,
          fullLocalPathsRedacted: true,
          rawVerifierOutputExcluded: true,
          rawLogsExcluded: true,
          reviewerNotesExcluded: true,
          sourceDirectoryPathExcluded: true,
          publicSidecarListenersAllowed: false,
          secretPath: "C:\\Users\\Alice\\secret.log"
        },
        limitations: ["productionReady remains false."]
      }),
      "utf8"
    );
    writeFileSync(manifestPath, "{}", "utf8");

    const result = readPackagingReleaseGateResultsImport(manifestPath);
    const text = JSON.stringify(result);
    expect(result.exists).toBe(true);
    expect(result.valid).toBe(true);
    expect(result.status).toBe("mixed_results");
    expect(result.importSummary).toMatchObject({
      total: 2,
      valid: 1,
      invalid: 1,
      copied: 1
    });
    expect(result.results?.[0]?.copied).toBe(true);
    expect(result.results?.[1]?.status).toBe("invalid_rejected");
    expect(result.refreshedIntake?.status).toBe("partial_results");
    expect(text).not.toContain("C:\\Users\\Alice");
    expect(text).not.toContain("secret.log");
    expect(text).not.toContain("stdout");
    expect(text).not.toContain("stderr");
  });

  it("reads sanitized release result workspace without treating drafts as release results", () => {
    const root = mkdtempSync(join(tmpdir(), "lumatrace-release-result-workspace-test-"));
    const manifestPath = join(root, "sidecar-manifest.json");
    writeFileSync(
      join(root, "lumatrace-windows-release-result-workspace-manifest.json"),
      JSON.stringify({
        evidenceKind: "windows-release-result-workspace",
        status: "workspace_ready",
        rcCandidateReady: false,
        productionReady: false,
        unsignedDraft: true,
        workspaceDirectory: "lumatrace-windows-release-result-workspace",
        currentIntake: {
          exists: true,
          status: "no_results",
          validResults: 0,
          invalidResults: 0,
          missingResults: 6
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
        files: [
          {
            role: "draft for CODE_SIGNING",
            relativePath: "drafts/lumatrace-windows-code-signing-readiness-result.json.draft.json",
            fileName: "lumatrace-windows-code-signing-readiness-result.json.draft.json",
            sha256: "a".repeat(64),
            sizeBytes: 100
          }
        ],
        instructions: ["Draft files are intentionally not valid release results."],
        excludedFiles: ["raw logs", "auth token", "valid release result files"],
        securityAssertions: {
          tokenRedacted: true,
          rawLogsExcluded: true,
          fullLocalPathsRedacted: true,
          secretPath: "C:\\Users\\Alice\\LumaTrace\\secret.log"
        },
        limitations: ["productionReady remains false."]
      }),
      "utf8"
    );
    writeFileSync(manifestPath, "{}", "utf8");

    const workspace = readPackagingReleaseResultWorkspace(manifestPath);
    const text = JSON.stringify(workspace);
    expect(workspace.exists).toBe(true);
    expect(workspace.valid).toBe(true);
    expect(workspace.status).toBe("workspace_ready");
    expect(workspace.productionReady).toBe(false);
    expect(workspace.gateSummary).toMatchObject({
      total: 1,
      requiresHumanReview: 1
    });
    expect(workspace.draftSummary).toMatchObject({
      total: 1,
      cannotRemoveBlockers: 1
    });
    expect(workspace.drafts?.[0]?.canRemoveBlocker).toBe(false);
    expect(text).not.toContain("C:\\Users\\Alice");
    expect(text).not.toContain("secret.log");
    expect(text).not.toContain("stdout");
    expect(text).not.toContain("stderr");
  });

  it("summarizes Windows RC status without making production ready", () => {
    const summary = buildWindowsRcStatus({
      manifestValidation: { valid: true },
      manifest: {
        name: "lumatrace-local-server",
        version: "0.0.0",
        artifactKind: "self-contained",
        platform: "win32",
        arch: "x64",
        targetTriple: "x86_64-pc-windows-msvc",
        fileName: "lumatrace-local-server-x86_64-pc-windows-msvc.exe",
        sizeBytes: 1,
        sha256: "a".repeat(64),
        buildTime: new Date(0).toISOString(),
        sourcePackageVersion: "0.0.0",
        nodeRequired: false,
        productionReady: false,
        licenseReviewStatus: "draft_requires_review",
        limitations: []
      },
      releaseReadiness: {
        exists: true,
        valid: true,
        fileName: "lumatrace-windows-packaging-release-readiness.json",
        releaseStatus: "blocked",
        productionReady: false,
        blockers: [
          {
            code: "CODE_SIGNING_NOT_CONFIGURED",
            reason: "Code signing is not configured.",
            requiredForProduction: true
          }
        ]
      },
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
            id: "automated_smoke",
            label: "Automated smoke",
            status: "passed",
            requiredForRelease: true
          },
          {
            id: "manual_gui_qa",
            label: "Manual GUI QA",
            status: "blocked",
            requiredForRelease: true
          }
        ],
        blockers: [
          {
            code: "MANUAL_GUI_QA",
            gateId: "manual_gui_qa",
            reason: "Manual GUI QA result is missing.",
            requiredForRelease: true
          }
        ]
      },
      releasePolicy: {
        exists: true,
        valid: true,
        fileName: "lumatrace-windows-release-policy-template.json",
        status: "draft_blocked",
        rcCandidateReady: false,
        productionReady: false,
        unsignedDraft: true,
        blockers: [
          {
            code: "UPDATER_POLICY_NOT_CONFIGURED",
            reason: "Updater policy is not configured.",
            requiredForRc: true
          }
        ]
      },
      manualGuiQaHandoff: {
        exists: true,
        valid: true,
        fileName: "lumatrace-windows-manual-gui-qa-handoff-manifest.json",
        status: "handoff_ready",
        manualGuiQaStatus: "not_run",
        productionReady: false
      },
      manualGuiQaResult: {
        exists: false,
        valid: false,
        fileName: "lumatrace-windows-manual-gui-qa-result.json",
        reason: "Windows manual GUI QA result is missing"
      }
    });

    expect(summary.status).toBe("blocked");
    expect(summary.productionReady).toBe(false);
    expect(summary.rcCandidateReady).toBe(false);
    expect(summary.evidence.selfContainedSidecar).toBe(true);
    expect(summary.evidence.sidecarProductionReady).toBe(false);
    expect(summary.evidence.manualGuiQaResultStatus).toBe("missing");
    expect(summary.gateCounts).toMatchObject({
      total: 2,
      passed: 1,
      blocked: 1
    });
    expect(summary.blockers.map((blocker) => blocker.code)).toEqual(
      expect.arrayContaining([
        "SIDECAR_PRODUCTION_READY_FALSE",
        "LICENSE_NOTICE_REVIEW_NOT_COMPLETE",
        "CODE_SIGNING_NOT_CONFIGURED",
        "MANUAL_GUI_QA",
        "UPDATER_POLICY_NOT_CONFIGURED",
        "MANUAL_GUI_QA_RESULT_NOT_PASSED"
      ])
    );
    expect(JSON.stringify(summary)).not.toContain("C:\\Users\\");
  });
});
