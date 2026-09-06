import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { localeCatalog } from "../apps/desktop/src/i18n/localeCatalog.ts";
import {
  evaluateStoreGates,
  type StoreGateInput,
  type StoreGateIssue,
  type WackOverall
} from "./windows-store-gates.ts";
import {
  assertPackageResourceModel,
  extractManifestResourceLanguages
} from "./windows-store-package-resources.ts";

interface StoreConfig {
  productId: string;
  displayName: string;
  description: string;
  applicationId: string;
  executable: string;
  identity: {
    name: string;
    publisher: string;
    publisherDisplayName: string;
    version: string;
    processorArchitecture: string;
  };
  targetDeviceFamily: {
    name: string;
    minVersion: string;
    maxVersionTested: string;
  };
  packageResourceLanguages: string[];
  packageFileName: string;
}

interface BuildManifest {
  schemaVersion?: number;
  status?: string;
  artifactKind?: string;
  productId?: string;
  unsigned?: boolean;
  productionReady?: boolean;
  storeUploadPerformed?: boolean;
  storeUploadEligible?: boolean;
  certificationEligible?: boolean;
  localTrustedSignatureRequiredForStoreUpload?: boolean;
  package?: { fileName?: string; sizeBytes?: number; sha256?: string } | null;
  identity?: StoreConfig["identity"];
  targetDeviceFamily?: StoreConfig["targetDeviceFamily"];
  application?: {
    id?: string;
    executable?: string;
    runtimeBehavior?: string;
    trustLevel?: string;
    restrictedCapability?: string;
  };
  languages?: string[];
  packageResourceLanguages?: string[];
  localizationModel?: string;
  inputs?: {
    baseTauriConfigSha256?: string;
    storeTauriConfigSha256?: string;
    sidecarSha256?: string;
    sidecarProductionReady?: boolean;
    sidecarLicenseReviewStatus?: string;
  };
  wack?: {
    overall?: WackOverall;
    reportRecorded?: boolean;
    reportFileName?: string;
    reportSha256?: string;
    kitVersion?: string;
    packageIdentityVersionArchitectureMatched?: boolean;
    testedPackageSha256?: string;
    requiredForStoreUpload?: boolean;
  };
  gateInputs?: StoreGateInput;
  storeUploadBlockers?: StoreGateIssue[];
  certificationBlockers?: StoreGateIssue[];
  advisories?: StoreGateIssue[];
}

const root = process.cwd();
const tauriDir = resolve(root, "apps/desktop/src-tauri");
const targetDir = resolve(tauriDir, "target/store-msix");
const outputDir = resolve(targetDir, "output");
const verifyDir = resolve(targetDir, "verify-unpacked");
const configPath = resolve(tauriDir, "store/store-config.json");
const baseTauriConfigPath = resolve(tauriDir, "tauri.conf.json");
const storeTauriConfigPath = resolve(tauriDir, "store/tauri.store.conf.json");
const buildManifestPath = resolve(targetDir, "build-manifest.json");
const localeDir = resolve(root, "apps/desktop/src/i18n/locales");

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function check(label: string, passed: boolean): void {
  console.log(`${passed ? "[ok]" : "[fail]"} ${label}`);
  if (!passed) {
    process.exitCode = 1;
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function findMakeAppx(): string | undefined {
  const configured = process.env.LUMATRACE_WINDOWS_SDK_BIN;
  if (configured !== undefined) {
    const candidate = resolve(configured, "makeappx.exe");
    return existsSync(candidate) ? candidate : undefined;
  }
  const kitsBin = "C:\\Program Files (x86)\\Windows Kits\\10\\bin";
  if (!existsSync(kitsBin)) {
    return undefined;
  }
  const versions = readdirSync(kitsBin, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d+\.\d+\.\d+\.\d+$/u.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
  return versions
    .map((version) => resolve(kitsBin, version, "x64/makeappx.exe"))
    .find((candidate) => existsSync(candidate));
}

check("Store config exists", existsSync(configPath));
check("Store build manifest exists", existsSync(buildManifestPath));
if (process.exitCode === 1) {
  process.exit(1);
}

const config = readJson<StoreConfig>(configPath);
const buildManifest = readJson<BuildManifest>(buildManifestPath);
const buildManifestText = readFileSync(buildManifestPath, "utf8");
const baseTauriConfig = readJson<{ bundle?: { active?: boolean } }>(baseTauriConfigPath);
const storeTauriConfig = readJson<{ version?: string; bundle?: { active?: boolean } }>(
  storeTauriConfigPath
);
const packagePath = resolve(outputDir, config.packageFileName);

check("default Tauri bundle remains inactive", baseTauriConfig.bundle?.active === false);
check("Store Tauri override remains bundle-inactive", storeTauriConfig.bundle?.active === false);
check("Store Tauri shell version is 1.0.3", storeTauriConfig.version === "1.0.3");
check("Store product ID is exact", config.productId === "9P3KNQZMFBM8");
check("Store identity name is exact", config.identity.name === "eirros.LumaTracePerformanceLab");
check(
  "Store publisher is exact",
  config.identity.publisher === "CN=B85377A1-202B-480D-9F05-881E4B75B24B"
);
check("Store publisher display name is exact", config.identity.publisherDisplayName === "eirros");
check("MSIX version is 1.0.3.0", config.identity.version === "1.0.3.0");
check("MSIX architecture is x64", config.identity.processorArchitecture === "x64");
check("Windows 11 minimum is exact", config.targetDeviceFamily.minVersion === "10.0.22000.0");
check("Store build succeeded", buildManifest.status === "success");
check("Store build manifest uses resource-separated gate schema", buildManifest.schemaVersion === 3);
check("Store artifact kind is MSIX", buildManifest.artifactKind === "microsoft-store-msix");
check("Store build records exact product ID", buildManifest.productId === config.productId);
check("Store package is explicitly unsigned", buildManifest.unsigned === true);
check("Store package does not claim production readiness", buildManifest.productionReady === false);
check("Store upload was not performed", buildManifest.storeUploadPerformed === false);
check(
  "Store package is eligible for Partner Center upload",
  buildManifest.storeUploadEligible === true
);
check(
  "Final certification eligibility remains false",
  buildManifest.certificationEligible === false
);
check(
  "Local CA-trusted signature is not treated as a Store upload requirement",
  buildManifest.localTrustedSignatureRequiredForStoreUpload === false
);
check(
  "Sidecar production gate remains false",
  buildManifest.inputs?.sidecarProductionReady === false
);
check(
  "Sidecar license review gate remains pending",
  buildManifest.inputs?.sidecarLicenseReviewStatus === "draft_requires_review"
);
check("WACK report is recorded", buildManifest.wack?.reportRecorded === true);
check("WACK overall result is PASS", buildManifest.wack?.overall === "PASS");
check(
  "WACK is not misrepresented as a mandatory Store upload rule",
  buildManifest.wack?.requiredForStoreUpload === false
);
check(
  "WACK report matched app identity, version, and architecture",
  buildManifest.wack?.packageIdentityVersionArchitectureMatched === true
);
check(
  "WACK evidence records a SHA-256",
  /^[a-f0-9]{64}$/u.test(buildManifest.wack?.reportSha256 ?? "")
);
check(
  "WACK evidence is bound to the exact MSIX SHA-256",
  buildManifest.wack?.testedPackageSha256 === sha256(packagePath)
);
check(
  "WACK report field contains only a file name",
  buildManifest.wack?.reportFileName !== undefined &&
    basename(buildManifest.wack.reportFileName) === buildManifest.wack.reportFileName
);

check("Store upload blocker list is empty", buildManifest.storeUploadBlockers?.length === 0);
const uploadBlockerCodes = new Set(
  buildManifest.storeUploadBlockers?.map((blocker) => blocker.code)
);
check("Unsigned package is not an upload blocker", !uploadBlockerCodes.has("UNSIGNED_PACKAGE"));
const certificationBlockerCodes = new Set(
  buildManifest.certificationBlockers?.map((blocker) => blocker.code)
);
for (const requiredBlocker of [
  "SIDECAR_NOT_PRODUCTION_READY",
  "LICENSE_REVIEW_PENDING",
  "INSTALLED_PACKAGE_GUI_QA_PENDING",
  "PARTNER_CENTER_FORMS_PENDING"
]) {
  check(
    `Certification blocker is recorded: ${requiredBlocker}`,
    certificationBlockerCodes.has(requiredBlocker)
  );
}
check(
  "Unsigned package is not a certification blocker for Store delivery",
  !certificationBlockerCodes.has("UNSIGNED_PACKAGE")
);
check(
  "Passing WACK is not retained as a blocker",
  !certificationBlockerCodes.has("WACK_AND_GUI_QA_PENDING")
);
check(
  "Store re-signing advisory is recorded",
  buildManifest.advisories?.some((advisory) => advisory.code === "STORE_WILL_RESIGN_MSIX") === true
);

if (buildManifest.gateInputs !== undefined) {
  const expectedGates = evaluateStoreGates(buildManifest.gateInputs);
  check(
    "Upload eligibility matches declared gate inputs",
    buildManifest.storeUploadEligible === expectedGates.storeUploadEligible
  );
  check(
    "Certification eligibility matches declared gate inputs",
    buildManifest.certificationEligible === expectedGates.certificationEligible
  );
  check(
    "Upload blockers match declared gate inputs",
    JSON.stringify(buildManifest.storeUploadBlockers) ===
      JSON.stringify(expectedGates.storeUploadBlockers)
  );
  check(
    "Certification blockers match declared gate inputs",
    JSON.stringify(buildManifest.certificationBlockers) ===
      JSON.stringify(expectedGates.certificationBlockers)
  );
} else {
  check("Gate inputs are recorded", false);
}
check("Package file exists", existsSync(packagePath));

if (
  existsSync(packagePath) &&
  buildManifest.package !== null &&
  buildManifest.package !== undefined
) {
  check("Package file name matches", buildManifest.package.fileName === basename(packagePath));
  check("Package size matches", buildManifest.package.sizeBytes === statSync(packagePath).size);
  check("Package hash matches", buildManifest.package.sha256 === sha256(packagePath));
}
check(
  "Base Tauri config hash is recorded",
  buildManifest.inputs?.baseTauriConfigSha256 === sha256(baseTauriConfigPath)
);
check(
  "Store Tauri config hash is recorded",
  buildManifest.inputs?.storeTauriConfigSha256 === sha256(storeTauriConfigPath)
);
check(
  "No local user path leaked into build manifest",
  !/[A-Z]:\\Users\\|\/(?:Users|home)\//iu.test(buildManifestText)
);
check(
  "No bearer token leaked into build manifest",
  !/Bearer\s+[A-Za-z0-9._~+/=-]+/u.test(buildManifestText)
);

const makeAppx = findMakeAppx();
check("MakeAppx is available for package inspection", makeAppx !== undefined);
if (makeAppx === undefined || !existsSync(packagePath)) {
  process.exit(1);
}

if (existsSync(verifyDir)) {
  rmSync(verifyDir, { recursive: true, force: true });
}
mkdirSync(verifyDir, { recursive: true });
const unpack = spawnSync(makeAppx, ["unpack", "/p", packagePath, "/d", verifyDir, "/o"], {
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
  windowsHide: true
});
check("MakeAppx can unpack and validate the MSIX", unpack.status === 0);
if (unpack.status !== 0) {
  const failureOutput = `${unpack.stdout ?? ""}\n${unpack.stderr ?? ""}`
    .trim()
    .split(/\r?\n/u)
    .slice(-40)
    .join("\n");
  process.stderr.write(`${failureOutput}\n`);
  process.exit(1);
}

const appxManifestPath = resolve(verifyDir, "AppxManifest.xml");
check("AppxManifest.xml is present", existsSync(appxManifestPath));
const appxManifest = existsSync(appxManifestPath) ? readFileSync(appxManifestPath, "utf8") : "";
const manifestHas = (fragment: string): boolean =>
  new RegExp(escapeRegex(fragment), "u").test(appxManifest);
check(
  "Manifest identity name matches Partner Center",
  manifestHas(`Name="${config.identity.name}"`)
);
check(
  "Manifest publisher matches Partner Center",
  manifestHas(`Publisher="${config.identity.publisher}"`)
);
check("Manifest version is 1.0.3.0", manifestHas(`Version="${config.identity.version}"`));
check("Manifest architecture is x64", manifestHas('ProcessorArchitecture="x64"'));
check("Manifest targets Windows Desktop", manifestHas('Name="Windows.Desktop"'));
check("Manifest minimum is Windows 11", manifestHas('MinVersion="10.0.22000.0"'));
check(
  "Manifest is packaged classic app",
  manifestHas('uap10:RuntimeBehavior="packagedClassicApp"')
);
check("Manifest is medium integrity", manifestHas('uap10:TrustLevel="mediumIL"'));
check("Manifest declares runFullTrust", manifestHas('<rescap:Capability Name="runFullTrust"'));
check("Main Tauri executable is packaged", existsSync(resolve(verifyDir, config.executable)));

const sourceSidecarManifest = readJson<{
  fileName: string;
  runtimeDirectory?: string;
  sha256: string;
}>(resolve(tauriDir, "binaries/sidecar-manifest.json"));
check(
  "Sidecar manifest is packaged",
  existsSync(resolve(verifyDir, "binaries/sidecar-manifest.json"))
);
check(
  "Sidecar executable is packaged",
  existsSync(resolve(verifyDir, "binaries", sourceSidecarManifest.fileName))
);
check(
  "Sidecar executable hash is preserved",
  existsSync(resolve(verifyDir, "binaries", sourceSidecarManifest.fileName)) &&
    sha256(resolve(verifyDir, "binaries", sourceSidecarManifest.fileName)) ===
      sourceSidecarManifest.sha256
);
check(
  "Bundled Node runtime is packaged",
  sourceSidecarManifest.runtimeDirectory !== undefined &&
    existsSync(resolve(verifyDir, "binaries", sourceSidecarManifest.runtimeDirectory, "node.exe"))
);
check(
  "Bundled local-server entry point is packaged",
  sourceSidecarManifest.runtimeDirectory !== undefined &&
    existsSync(
      resolve(
        verifyDir,
        "binaries",
        sourceSidecarManifest.runtimeDirectory,
        "app/dist/src/index.js"
      )
    )
);
check(
  "Packaging notices are present",
  existsSync(resolve(verifyDir, "binaries/packaging-notices.json"))
);
check(
  "Third-party notices are present",
  existsSync(resolve(verifyDir, "binaries/THIRD-PARTY-NOTICES.md"))
);
check("Store logo is present", existsSync(resolve(verifyDir, "Assets/StoreLogo.png")));
check("Square 44 logo is present", existsSync(resolve(verifyDir, "Assets/Square44x44Logo.png")));
check("Square 150 logo is present", existsSync(resolve(verifyDir, "Assets/Square150x150Logo.png")));
check("Package is unsigned", !existsSync(resolve(verifyDir, "AppxSignature.p7x")));
check(
  "Debug symbols are not in the package",
  !readdirSync(verifyDir, { recursive: true }).some((entry) => String(entry).endsWith(".pdb"))
);

const localeFiles = readdirSync(localeDir)
  .filter((name) => name.endsWith(".json"))
  .map((name) => name.slice(0, -5));
const localeFileSet = new Set(localeFiles);
const catalogLanguageSet = new Set<string>(localeCatalog.map(({ locale }) => locale));
const orphanLocaleFiles = localeFiles.filter((locale) => !catalogLanguageSet.has(locale));
check("Every packaged locale belongs to the Store catalog", orphanLocaleFiles.length === 0);
const expectedLanguages = localeCatalog
  .map(({ locale }) => locale)
  .filter((locale) => localeFileSet.has(locale));
check(
  "Build manifest languages match packaged Store locales",
  JSON.stringify(buildManifest.languages) === JSON.stringify(expectedLanguages)
);
const manifestResourceLanguages = extractManifestResourceLanguages(appxManifest);
check(
  "Store config keeps package resources separate from app and listing locales",
  JSON.stringify(config.packageResourceLanguages) === JSON.stringify(["en-US"])
);
check(
  "AppxManifest declares only its literal metadata language",
  JSON.stringify(manifestResourceLanguages) === JSON.stringify(config.packageResourceLanguages)
);
check(
  "Build manifest records the exact MSIX resource languages",
  JSON.stringify(buildManifest.packageResourceLanguages) ===
    JSON.stringify(config.packageResourceLanguages)
);
check(
  "Build manifest records bundled JSON localization",
  buildManifest.localizationModel === "bundled-json-with-literal-msix-manifest"
);
try {
  assertPackageResourceModel({
    packageResourceLanguages: config.packageResourceLanguages,
    manifestText: appxManifest,
    resourcesPriExists: existsSync(resolve(verifyDir, "resources.pri"))
  });
  check("MSIX resource model is internally consistent", true);
} catch (error) {
  console.error(error);
  check("MSIX resource model is internally consistent", false);
}

if (process.exitCode === 1) {
  console.error("Microsoft Store MSIX verification failed.");
  process.exit(1);
}

console.log("Microsoft Store MSIX verification passed.");
