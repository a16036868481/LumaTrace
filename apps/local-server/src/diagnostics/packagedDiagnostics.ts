import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_LOG_ROTATION_POLICY, collectLogMetadata } from "./logMetadata";
import type { LogFileMetadata } from "./logMetadata";
import { sanitizePackagedDiagnosticText } from "./sanitizePackagedDiagnostics";

export type SidecarArtifactKind = "self-contained" | "dev-wrapper";

export interface SidecarManifest {
  name: string;
  version: string;
  artifactKind: SidecarArtifactKind;
  platform: NodeJS.Platform;
  arch: NodeJS.Architecture;
  targetTriple?: string;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  buildTime: string;
  sourcePackageVersion: string;
  nodeRequired: boolean;
  productionReady: boolean;
  limitations: string[];
  tauriExternalBin?: string;
  runtimeDirectory?: string;
  runtimeSizeBytes?: number;
  runtimeFileCount?: number;
  bundledNodeVersion?: string;
  noticesFile?: string;
  noticesSha256?: string;
  thirdPartyNoticesFile?: string;
  thirdPartyNoticesSha256?: string;
  licenseReviewStatus?: "draft_requires_review" | "complete";
}

export interface SidecarManifestValidation {
  valid: boolean;
  manifest?: SidecarManifest;
  artifactPath?: string;
  reason?: string;
}

const TARGET_TRIPLES: Partial<Record<NodeJS.Platform, Partial<Record<NodeJS.Architecture, string>>>> = {
  win32: {
    x64: "x86_64-pc-windows-msvc",
    arm64: "aarch64-pc-windows-msvc"
  },
  darwin: {
    x64: "x86_64-apple-darwin",
    arm64: "aarch64-apple-darwin"
  },
  linux: {
    x64: "x86_64-unknown-linux-gnu",
    arm64: "aarch64-unknown-linux-gnu"
  }
};

export function getSidecarTargetTriple(
  platform: NodeJS.Platform = process.platform,
  arch: NodeJS.Architecture = process.arch
): string {
  return TARGET_TRIPLES[platform]?.[arch] ?? `${arch}-${platform}`;
}

export function getSelfContainedSidecarFileName(
  platform: NodeJS.Platform = process.platform,
  arch: NodeJS.Architecture = process.arch
): string {
  const extension = platform === "win32" ? ".exe" : "";
  return `lumatrace-local-server-${getSidecarTargetTriple(platform, arch)}${extension}`;
}

export function getDevWrapperSidecarFileName(
  platform: NodeJS.Platform = process.platform,
  arch: NodeJS.Architecture = process.arch
): string {
  const extension = platform === "win32" ? ".exe" : "";
  return `lumatrace-local-server-${getSidecarTargetTriple(platform, arch)}${extension}`;
}

export function hashFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function readSidecarManifest(manifestPath: string): SidecarManifestValidation {
  if (!existsSync(manifestPath)) {
    return {
      valid: false,
      reason: "sidecar manifest is missing"
    };
  }

  let manifest: SidecarManifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as SidecarManifest;
  } catch {
    return {
      valid: false,
      reason: "sidecar manifest is not valid JSON"
    };
  }

  const artifactPath = resolve(manifestPath, "..", manifest.fileName);
  if (!existsSync(artifactPath)) {
    return {
      valid: false,
      manifest,
      artifactPath,
      reason: "sidecar artifact is missing"
    };
  }

  const actualHash = hashFile(artifactPath);
  if (actualHash !== manifest.sha256) {
    return {
      valid: false,
      manifest,
      artifactPath,
      reason: "sidecar artifact hash does not match manifest"
    };
  }

  const actualSize = statSync(artifactPath).size;
  if (actualSize !== manifest.sizeBytes) {
    return {
      valid: false,
      manifest,
      artifactPath,
      reason: "sidecar artifact size does not match manifest"
    };
  }

  return {
    valid: true,
    manifest,
    artifactPath
  };
}

export function listLogFiles(logsDir: string | undefined): LogFileMetadata[] {
  return collectLogMetadata(logsDir);
}

export { DEFAULT_LOG_ROTATION_POLICY, sanitizePackagedDiagnosticText };
export type { LogFileMetadata, LogRotationPolicy, LogRotationResult } from "./logMetadata";
export {
  DEFAULT_SIDECAR_CRASH_POLICY,
  canRestartSidecar,
  classifySidecarCrash,
  clearSidecarCrashState,
  createSidecarCrashState,
  recordSidecarExit,
  recordSidecarRestartAttempt
} from "./sidecarCrashRecovery";
export type {
  SidecarCrashReason,
  SidecarCrashReasonCode,
  SidecarCrashState,
  SidecarCrashStatus
} from "./sidecarCrashRecovery";
export {
  buildPackagingNoticeManifest,
  PINNED_LICENSE_ASSETS,
  packagingNoticeStats,
  renderThirdPartyNoticesMarkdown,
  stagePinnedLicenseAssetsForRuntime
} from "./packagingNotices";
export type {
  PackagingNoticeEntry,
  PackagingNoticeFile,
  PackagingNoticeManifest,
  PackagingNoticeReviewStatus,
  PackagingNoticeSummary,
  PinnedLicenseAssetSpec,
  StagedLicenseAsset
} from "./packagingNotices";
