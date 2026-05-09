import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

interface TauriConfig {
  bundle?: {
    active?: boolean;
    externalBin?: string[];
    resources?: string[];
  };
}

interface SidecarManifest {
  artifactKind?: string;
  fileName?: string;
  nodeRequired?: boolean;
  productionReady?: boolean;
  runtimeDirectory?: string;
  noticesFile?: string;
  thirdPartyNoticesFile?: string;
  licenseReviewStatus?: string;
  sha256?: string;
}

interface BundleDraftManifest {
  schemaVersion: 1;
  generatedAt: string;
  bundleKind: "portable-release-directory";
  platform: NodeJS.Platform;
  arch: NodeJS.Architecture;
  unsigned: true;
  installerBuilt: false;
  productionReady: false;
  codeSigningConfigured: false;
  updaterConfigured: false;
  releaseExecutable: {
    fileName: string;
    sizeBytes: number;
    sha256: string;
  };
  sidecarExecutable: {
    fileName: string;
    sizeBytes: number;
    sha256: string;
  };
  resources: {
    manifestFile: string;
    manifestSha256: string;
    runtimeDirectory: string;
    bundledNodeFile: string;
    packagingNoticesFile: string;
    packagingNoticesSha256: string;
    thirdPartyNoticesFile: string;
    thirdPartyNoticesSha256: string;
  };
  limitations: string[];
}

const root = process.cwd();
const tauriConfigPath = resolve(root, "apps/desktop/src-tauri/tauri.conf.json");
const releaseDir = resolve(root, "apps/desktop/src-tauri/target/release");
const releaseResourcesDir = resolve(releaseDir, "binaries");
const releaseExeName = process.platform === "win32" ? "lumatrace-desktop.exe" : "lumatrace-desktop";
const releaseExePath = resolve(releaseDir, releaseExeName);
const releaseSidecarName = process.platform === "win32" ? "lumatrace-local-server.exe" : "lumatrace-local-server";
const releaseSidecarPath = resolve(releaseDir, releaseSidecarName);
const releaseManifestPath = resolve(releaseResourcesDir, "sidecar-manifest.json");
const bundleDraftManifestPath = resolve(releaseDir, "lumatrace-bundle-draft-manifest.json");
const installerDraftManifestPath = resolve(releaseDir, "lumatrace-installer-draft-manifest.json");

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function fileInfo(path: string): { fileName: string; sizeBytes: number; sha256: string } {
  return {
    fileName: basename(path),
    sizeBytes: statSync(path).size,
    sha256: sha256(path)
  };
}

function check(name: string, passed: boolean): void {
  console.log(`${passed ? "[ok]" : "[fail]"} ${name}`);
  if (!passed) {
    process.exitCode = 1;
  }
}

function assertCleanText(label: string, text: string): void {
  check(`${label} has no bearer token`, !/Bearer\s+[A-Za-z0-9._~+/=-]+/u.test(text));
  check(`${label} has no auth subprotocol token`, !/lumatrace-auth\.[A-Za-z0-9._~+/=-]+/u.test(text));
  check(`${label} has no local user path`, !/[A-Z]:\\Users\\|\/(?:Users|home)\//iu.test(text));
  check(`${label} does not claim production readiness`, !/"productionReady"\s*:\s*true/u.test(text));
}

function findInstallerArtifacts(): string[] {
  const bundleDir = resolve(releaseDir, "bundle");
  if (!existsSync(bundleDir)) {
    return [];
  }
  return readdirSync(bundleDir, { recursive: true })
    .map((entry) => String(entry))
    .filter((entry) => /\.(exe|msi|msix|appx|nsis|dmg|pkg)$/iu.test(entry));
}

function findUnaccountedInstallerArtifacts(): string[] {
  const artifacts = findInstallerArtifacts();
  if (!existsSync(installerDraftManifestPath)) {
    return artifacts;
  }

  const installerDraft = readJson<{ installerArtifacts?: Array<{ relativePath?: string }> }>(installerDraftManifestPath);
  const accounted = new Set(
    (installerDraft.installerArtifacts ?? [])
      .map((artifact) => artifact.relativePath)
      .filter((value): value is string => value !== undefined)
      .map((value) => value.replace(/\\/gu, "/"))
  );
  return artifacts.filter((artifact) => !accounted.has(`bundle/${artifact.replace(/\\/gu, "/")}`));
}

check("Tauri config exists", existsSync(tauriConfigPath));
check("release desktop executable exists", existsSync(releaseExePath));
check("release externalBin sidecar exists", existsSync(releaseSidecarPath));
check("release sidecar manifest exists", existsSync(releaseManifestPath));

if (process.exitCode === 1) {
  console.error("Windows bundle draft preflight failed");
  process.exit(1);
}

const tauriConfig = readJson<TauriConfig>(tauriConfigPath);
const sidecarManifest = readJson<SidecarManifest>(releaseManifestPath);
const runtimeDirectory = sidecarManifest.runtimeDirectory ?? "lumatrace-local-server-runtime";
const runtimeDir = resolve(releaseResourcesDir, runtimeDirectory);
const bundledNodeFile = process.platform === "win32" ? "node.exe" : "node";
const bundledNodePath = resolve(runtimeDir, bundledNodeFile);
const runtimeEntryPath = resolve(runtimeDir, "app/dist/src/index.js");
const noticesFile = sidecarManifest.noticesFile ?? "packaging-notices.json";
const thirdPartyNoticesFile = sidecarManifest.thirdPartyNoticesFile ?? "THIRD-PARTY-NOTICES.md";
const noticesPath = resolve(releaseResourcesDir, noticesFile);
const thirdPartyNoticesPath = resolve(releaseResourcesDir, thirdPartyNoticesFile);
const unaccountedInstallerArtifacts = findUnaccountedInstallerArtifacts();

check("bundle.active remains false for draft-only installer work", tauriConfig.bundle?.active === false);
check("Tauri externalBin uses fixed local-server sidecar", tauriConfig.bundle?.externalBin?.includes("binaries/lumatrace-local-server") === true);
check("Tauri resources include sidecar manifest", tauriConfig.bundle?.resources?.includes("binaries/sidecar-manifest.json") === true);
check("Tauri resources include packaging notices", tauriConfig.bundle?.resources?.includes("binaries/packaging-notices.json") === true);
check("Tauri resources include third-party notices", tauriConfig.bundle?.resources?.includes("binaries/THIRD-PARTY-NOTICES.md") === true);
check("Tauri resources include sidecar runtime", tauriConfig.bundle?.resources?.includes("binaries/lumatrace-local-server-runtime") === true);
check("sidecar is self-contained", sidecarManifest.artifactKind === "self-contained");
check("sidecar does not require system Node", sidecarManifest.nodeRequired === false);
check("sidecar keeps productionReady=false", sidecarManifest.productionReady === false);
check("sidecar license review remains draft", sidecarManifest.licenseReviewStatus === "draft_requires_review");
check("bundled Node exists in release resources", existsSync(bundledNodePath));
check("local-server runtime entry exists in release resources", existsSync(runtimeEntryPath));
check("packaging notices exist in release resources", existsSync(noticesPath));
check("third-party notices exist in release resources", existsSync(thirdPartyNoticesPath));
check("no unaccounted installer artifacts are present in portable draft verification", unaccountedInstallerArtifacts.length === 0);

const releaseManifestText = readFileSync(releaseManifestPath, "utf8");
const noticesText = existsSync(noticesPath) ? readFileSync(noticesPath, "utf8") : "";
const thirdPartyNoticesText = existsSync(thirdPartyNoticesPath) ? readFileSync(thirdPartyNoticesPath, "utf8") : "";
assertCleanText("release sidecar manifest", releaseManifestText);
assertCleanText("release packaging notices", noticesText);
assertCleanText("release third-party notices", thirdPartyNoticesText);

if (process.exitCode === 1) {
  console.error("Windows bundle draft verification failed");
  process.exit(1);
}

const draftManifest: BundleDraftManifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  bundleKind: "portable-release-directory",
  platform: process.platform,
  arch: process.arch,
  unsigned: true,
  installerBuilt: false,
  productionReady: false,
  codeSigningConfigured: false,
  updaterConfigured: false,
  releaseExecutable: fileInfo(releaseExePath),
  sidecarExecutable: fileInfo(releaseSidecarPath),
  resources: {
    manifestFile: "binaries/sidecar-manifest.json",
    manifestSha256: sha256(releaseManifestPath),
    runtimeDirectory: `binaries/${runtimeDirectory}`,
    bundledNodeFile: `binaries/${runtimeDirectory}/${bundledNodeFile}`,
    packagingNoticesFile: `binaries/${noticesFile}`,
    packagingNoticesSha256: sha256(noticesPath),
    thirdPartyNoticesFile: `binaries/${thirdPartyNoticesFile}`,
    thirdPartyNoticesSha256: sha256(thirdPartyNoticesPath)
  },
  limitations: [
    "This is an unsigned portable release-directory draft, not an installer.",
    "No code signing, updater, notarization, or store distribution is configured.",
    "productionReady remains false until signing, installer QA, license notice review, and release checks are complete.",
    "The sidecar remains local-only and packaged auth remains required."
  ]
};

writeFileSync(bundleDraftManifestPath, `${JSON.stringify(draftManifest, null, 2)}\n`, "utf8");
const draftText = readFileSync(bundleDraftManifestPath, "utf8");
assertCleanText("bundle draft manifest", draftText);
check("bundle draft manifest written", existsSync(bundleDraftManifestPath));
check("bundle draft manifest says unsigned", /"unsigned": true/u.test(draftText));
check("bundle draft manifest says installerBuilt=false", /"installerBuilt": false/u.test(draftText));
check("bundle draft manifest keeps productionReady=false", /"productionReady": false/u.test(draftText));

if (process.exitCode === 1) {
  console.error("Windows bundle draft manifest verification failed");
  process.exit(1);
}

console.log(`Windows bundle draft manifest written to ${bundleDraftManifestPath}`);
console.log("Windows bundle draft verification passed");
