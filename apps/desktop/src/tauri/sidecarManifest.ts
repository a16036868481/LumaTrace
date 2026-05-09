import { detectTauri, invokeTauri } from "./tauriClient";

export interface SidecarManifest {
  name: string;
  version: string;
  artifactKind: "self-contained" | "dev-wrapper";
  platform: string;
  arch: string;
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

export async function getSidecarManifest(): Promise<SidecarManifest | null> {
  if (!detectTauri()) {
    return null;
  }
  return invokeTauri<SidecarManifest | null>("get_sidecar_manifest");
}
