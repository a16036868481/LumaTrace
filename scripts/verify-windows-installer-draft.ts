import { existsSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

interface TauriConfig {
  bundle?: {
    active?: boolean;
  };
}

interface DraftArtifact {
  relativePath: string;
  sizeBytes: number;
  sha256: string;
}

interface InstallerDraftManifest {
  status?: string;
  bundleKind?: string;
  bundleTarget?: string;
  unsigned?: boolean;
  installerBuilt?: boolean;
  productionReady?: boolean;
  codeSigningConfigured?: boolean;
  updaterConfigured?: boolean;
  sidecarManifest?: {
    artifactKind?: string;
    nodeRequired?: boolean;
    productionReady?: boolean;
  };
  installerArtifacts?: DraftArtifact[];
}

const root = process.cwd();
const releaseDir = resolve(root, "apps/desktop/src-tauri/target/release");
const tauriConfigPath = resolve(root, "apps/desktop/src-tauri/tauri.conf.json");
const manifestPath = resolve(releaseDir, "lumatrace-installer-draft-manifest.json");

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
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
  check(`${label} has no stack trace`, !/\bat\s+[^\r\n]+:\d+:\d+/u.test(text));
  check(`${label} does not claim production readiness`, !/"productionReady"\s*:\s*true/u.test(text));
}

check("installer draft manifest exists", existsSync(manifestPath));
check("Tauri config exists", existsSync(tauriConfigPath));
if (process.exitCode === 1) {
  process.exit(1);
}

const manifestText = readFileSync(manifestPath, "utf8");
const manifest = readJson<InstallerDraftManifest>(manifestPath);
const tauriConfig = readJson<TauriConfig>(tauriConfigPath);
const artifacts = manifest.installerArtifacts ?? [];

check("default tauri.conf keeps bundle.active=false", tauriConfig.bundle?.active === false);
check("installer draft succeeded", manifest.status === "success");
check("installer draft kind is NSIS draft", manifest.bundleKind === "windows-nsis-installer-draft");
check("installer target is nsis", manifest.bundleTarget === "nsis");
check("installer draft is unsigned", manifest.unsigned === true);
check("installerBuilt is true for draft artifact", manifest.installerBuilt === true);
check("productionReady remains false", manifest.productionReady === false);
check("code signing remains unconfigured", manifest.codeSigningConfigured === false);
check("updater remains unconfigured", manifest.updaterConfigured === false);
check("sidecar remains self-contained", manifest.sidecarManifest?.artifactKind === "self-contained");
check("sidecar does not require system Node", manifest.sidecarManifest?.nodeRequired === false);
check("sidecar manifest remains productionReady=false", manifest.sidecarManifest?.productionReady === false);
check("at least one installer artifact is recorded", artifacts.length > 0);

for (const artifact of artifacts) {
  const artifactPath = resolve(releaseDir, artifact.relativePath);
  check(`installer artifact exists: ${artifact.relativePath}`, existsSync(artifactPath));
  if (existsSync(artifactPath)) {
    check(`installer artifact size matches: ${artifact.relativePath}`, statSync(artifactPath).size === artifact.sizeBytes);
    check(`installer artifact hash matches: ${artifact.relativePath}`, sha256(artifactPath) === artifact.sha256);
    check(`installer artifact is NSIS exe: ${artifact.relativePath}`, /\.exe$/iu.test(artifact.relativePath));
  }
}

assertCleanText("installer draft manifest", manifestText);

if (process.exitCode === 1) {
  console.error("Windows installer draft verification failed");
  process.exit(1);
}

console.log("Windows installer draft verification passed");
