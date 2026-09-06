import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { localeCatalog } from "../apps/desktop/src/i18n/localeCatalog.ts";
import {
  evaluateStoreGates,
  type StoreGateIssue,
  type WackOverall
} from "./windows-store-gates.ts";
import {
  assertPackageResourceModel,
  renderPackageResourceLanguages
} from "./windows-store-package-resources.ts";

interface StoreConfig {
  schemaVersion: number;
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

interface SidecarManifest {
  artifactKind: string;
  fileName: string;
  sha256: string;
  runtimeDirectory?: string;
  runtimeFileCount?: number;
  runtimeSizeBytes?: number;
  noticesFile?: string;
  noticesSha256?: string;
  thirdPartyNoticesFile?: string;
  thirdPartyNoticesSha256?: string;
  productionReady: boolean;
  licenseReviewStatus?: string;
}

interface WackEvidence {
  overall: WackOverall;
  reportRecorded: boolean;
  reportFileName?: string;
  reportSha256?: string;
  kitVersion?: string;
  packageIdentityVersionArchitectureMatched?: boolean;
  testedPackageSha256?: string;
  requiredForStoreUpload: false;
  note: string;
}

interface BuildManifest {
  schemaVersion: 3;
  generatedAt: string;
  status: "success" | "failed";
  artifactKind: "microsoft-store-msix";
  productId: string;
  unsigned: true;
  productionReady: false;
  storeUploadPerformed: false;
  storeUploadEligible: boolean;
  certificationEligible: boolean;
  localTrustedSignatureRequiredForStoreUpload: false;
  package: {
    fileName: string;
    sizeBytes: number;
    sha256: string;
  } | null;
  identity: StoreConfig["identity"];
  targetDeviceFamily: StoreConfig["targetDeviceFamily"];
  application: {
    id: string;
    executable: string;
    runtimeBehavior: "packagedClassicApp";
    trustLevel: "mediumIL";
    restrictedCapability: "runFullTrust";
  };
  languages: string[];
  packageResourceLanguages: string[];
  localizationModel: "bundled-json-with-literal-msix-manifest";
  inputs: {
    desktopExeSha256: string;
    sidecarSha256: string;
    sidecarArtifactKind: string;
    sidecarProductionReady: boolean;
    sidecarLicenseReviewStatus: string;
    baseTauriConfigSha256: string;
    storeTauriConfigSha256: string;
    noticesSha256: string;
    thirdPartyNoticesSha256: string;
  };
  sdk: {
    makeAppxVersion: string;
  };
  wack: WackEvidence;
  gateInputs: {
    packageBuilt: boolean;
    makeAppxValidated: boolean;
    wackOverall: WackOverall;
    sidecarProductionReady: boolean;
    licenseReviewApproved: boolean;
    installedPackageGuiQaPassed: boolean;
    partnerCenterFormsComplete: boolean;
  };
  storeUploadBlockers: StoreGateIssue[];
  certificationBlockers: StoreGateIssue[];
  advisories: StoreGateIssue[];
  limitations: string[];
}

const root = process.cwd();
const tauriDir = resolve(root, "apps/desktop/src-tauri");
const storeDir = resolve(tauriDir, "store");
const storeConfigPath = resolve(storeDir, "store-config.json");
const templatePath = resolve(storeDir, "AppxManifest.template.xml");
const baseTauriConfigPath = resolve(tauriDir, "tauri.conf.json");
const storeTauriConfigPath = resolve(storeDir, "tauri.store.conf.json");
const releaseDir = resolve(tauriDir, "target/release");
const binariesDir = resolve(tauriDir, "binaries");
const localeDir = resolve(root, "apps/desktop/src/i18n/locales");
const targetDir = resolve(tauriDir, "target/store-msix");
const layoutDir = resolve(targetDir, "layout");
const outputDir = resolve(targetDir, "output");
const buildManifestPath = resolve(targetDir, "build-manifest.json");

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertInsideTarget(path: string): void {
  const normalizedTarget = `${targetDir.toLowerCase()}\\`;
  const normalizedPath = `${resolve(path).toLowerCase()}\\`;
  assert(
    normalizedPath.startsWith(normalizedTarget),
    `Refusing to modify path outside Store target: ${path}`
  );
}

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function renderTemplate(
  template: string,
  replacements: Record<string, string>,
  rawReplacements: Record<string, string> = {}
): string {
  let result = template;
  for (const [name, value] of Object.entries(rawReplacements)) {
    result = result.replaceAll(`{{${name}}}`, value);
  }
  for (const [name, value] of Object.entries(replacements)) {
    result = result.replaceAll(`{{${name}}}`, xmlEscape(value));
  }
  assert(
    !/\{\{[A-Z_]+\}\}/u.test(result),
    "Appx manifest template contains unresolved placeholders."
  );
  return result;
}

function findMakeAppx(): { path: string; version: string } {
  const configured = process.env.LUMATRACE_WINDOWS_SDK_BIN;
  if (configured !== undefined) {
    const candidate = resolve(configured, "makeappx.exe");
    assert(
      existsSync(candidate),
      `MakeAppx was not found in LUMATRACE_WINDOWS_SDK_BIN: ${configured}`
    );
    return { path: candidate, version: basename(dirname(configured)) };
  }

  const kitsBin = "C:\\Program Files (x86)\\Windows Kits\\10\\bin";
  assert(existsSync(kitsBin), "Windows SDK bin directory was not found.");
  const versions = readdirSync(kitsBin, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d+\.\d+\.\d+\.\d+$/u.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
  for (const version of versions) {
    const candidate = resolve(kitsBin, version, "x64/makeappx.exe");
    if (existsSync(candidate)) {
      return { path: candidate, version };
    }
  }
  throw new Error("MakeAppx.exe was not found in an installed x64 Windows SDK.");
}

function readPeMachine(path: string): number {
  const bytes = readFileSync(path);
  assert(
    bytes.length > 0x40 && bytes.readUInt16LE(0) === 0x5a4d,
    `${basename(path)} is not a PE executable.`
  );
  const peOffset = bytes.readUInt32LE(0x3c);
  assert(
    bytes.length >= peOffset + 6 && bytes.readUInt32LE(peOffset) === 0x00004550,
    `${basename(path)} has no PE header.`
  );
  return bytes.readUInt16LE(peOffset + 4);
}

function copyFile(source: string, destination: string): void {
  assert(existsSync(source), `Required Store input is missing: ${source}`);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
}

function copyDirectory(source: string, destination: string): void {
  assert(existsSync(source), `Required Store directory is missing: ${source}`);
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const sourceEntry = resolve(source, entry.name);
    const destinationEntry = resolve(destination, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(sourceEntry, destinationEntry);
    } else if (entry.isFile()) {
      copyFile(sourceEntry, destinationEntry);
    } else {
      throw new Error(`Unsupported link or special file in Store runtime: ${sourceEntry}`);
    }
  }
}

function latestModifiedMs(path: string): number {
  if (!existsSync(path)) {
    return 0;
  }
  const status = statSync(path);
  if (status.isFile()) {
    return status.mtimeMs;
  }
  let latest = status.mtimeMs;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    latest = Math.max(latest, latestModifiedMs(resolve(path, entry.name)));
  }
  return latest;
}

function countFiles(path: string): number {
  let count = 0;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      count += countFiles(resolve(path, entry.name));
    } else if (entry.isFile()) {
      count += 1;
    }
  }
  return count;
}

function writeBuildManifest(manifest: BuildManifest): void {
  mkdirSync(targetDir, { recursive: true });
  writeFileSync(buildManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

assert(process.platform === "win32", "Microsoft Store MSIX packaging can only run on Windows.");
assert(existsSync(storeConfigPath), "Store configuration is missing.");
assert(existsSync(templatePath), "Appx manifest template is missing.");
assertInsideTarget(layoutDir);
assertInsideTarget(outputDir);

const config = readJson<StoreConfig>(storeConfigPath);
const wack: WackEvidence = {
  overall: "NOT_RECORDED",
  reportRecorded: false,
  requiredForStoreUpload: false,
  note: "No post-build WACK report is recorded yet. Run record:windows-store-wack against the exact generated MSIX before certification submission."
};
const baseTauriConfig = readJson<{ bundle?: { active?: boolean } }>(baseTauriConfigPath);
const storeTauriConfig = readJson<{ version?: string; bundle?: { active?: boolean } }>(
  storeTauriConfigPath
);
assert(
  baseTauriConfig.bundle?.active === false,
  "Default tauri.conf.json must keep bundle.active=false."
);
assert(
  storeTauriConfig.bundle?.active === false,
  "Store Tauri override must keep bundle.active=false."
);
assert(storeTauriConfig.version === "1.0.3", "Store Tauri shell version must be 1.0.3.");
assert(config.identity.version === "1.0.3.0", "MSIX package version must be 1.0.3.0.");
assert(
  config.identity.processorArchitecture === "x64",
  "Only the reviewed x64 Store package is supported."
);
assert(
  config.targetDeviceFamily.minVersion === "10.0.22000.0",
  "Store minimum Windows version must be 10.0.22000.0."
);

const desktopExePath = resolve(releaseDir, config.executable);
assert(existsSync(desktopExePath), `Latest Tauri executable is missing: ${desktopExePath}`);
assert(readPeMachine(desktopExePath) === 0x8664, "Tauri executable is not x64.");
const frontendModifiedMs = latestModifiedMs(resolve(root, "apps/desktop/dist"));
assert(
  statSync(desktopExePath).mtimeMs >= frontendModifiedMs,
  "Tauri executable is older than the built frontend. Rebuild the Store shell first."
);

const sidecarManifestPath = resolve(binariesDir, "sidecar-manifest.json");
const sidecarManifest = readJson<SidecarManifest>(sidecarManifestPath);
assert(
  sidecarManifest.artifactKind === "self-contained",
  "Store package requires the self-contained sidecar."
);
assert(
  sidecarManifest.productionReady === false,
  "The Store staging workflow must not bypass sidecar productionReady=false."
);
assert(
  sidecarManifest.licenseReviewStatus === "draft_requires_review",
  "Store staging requires licenseReviewStatus=draft_requires_review until formal review."
);
assert(
  sidecarManifest.runtimeDirectory !== undefined,
  "Sidecar runtime directory is not recorded."
);
assert(sidecarManifest.noticesFile !== undefined, "Packaging notices file is not recorded.");
assert(
  sidecarManifest.thirdPartyNoticesFile !== undefined,
  "Third-party notices file is not recorded."
);
const sidecarPath = resolve(binariesDir, sidecarManifest.fileName);
const runtimeDir = resolve(binariesDir, sidecarManifest.runtimeDirectory);
const noticesPath = resolve(binariesDir, sidecarManifest.noticesFile);
const thirdPartyNoticesPath = resolve(binariesDir, sidecarManifest.thirdPartyNoticesFile);
assert(existsSync(sidecarPath), "Sidecar executable is missing.");
assert(readPeMachine(sidecarPath) === 0x8664, "Sidecar executable is not x64.");
assert(
  sha256(sidecarPath) === sidecarManifest.sha256,
  "Sidecar executable hash does not match its manifest."
);
assert(existsSync(runtimeDir), "Sidecar runtime directory is missing.");
assert(existsSync(resolve(runtimeDir, "node.exe")), "Bundled Node runtime is missing.");
assert(
  existsSync(resolve(runtimeDir, "app/dist/src/index.js")),
  "Bundled local-server entry point is missing."
);
if (sidecarManifest.runtimeFileCount !== undefined) {
  assert(
    countFiles(runtimeDir) === sidecarManifest.runtimeFileCount,
    "Sidecar runtime file count does not match its manifest."
  );
}
assert(
  sha256(noticesPath) === sidecarManifest.noticesSha256,
  "Packaging notices hash does not match the sidecar manifest."
);
assert(
  sha256(thirdPartyNoticesPath) === sidecarManifest.thirdPartyNoticesSha256,
  "Third-party notices hash does not match the sidecar manifest."
);

const localeFiles = readdirSync(localeDir)
  .filter((name) => name.endsWith(".json"))
  .map((name) => name.slice(0, -5));
const localeFileSet = new Set(localeFiles);
const catalogLanguageSet = new Set<string>(localeCatalog.map(({ locale }) => locale));
const orphanLocaleFiles = localeFiles.filter((locale) => !catalogLanguageSet.has(locale));
assert(
  orphanLocaleFiles.length === 0,
  `Locale files outside the Store catalog: ${orphanLocaleFiles.join(", ")}`
);
const languages = localeCatalog
  .map(({ locale }) => locale)
  .filter((locale) => localeFileSet.has(locale));
assert(languages.includes("en-US"), "English locale is required for the Store package.");
assert(languages.length > 0, "No packaged UI languages were found.");

if (existsSync(targetDir)) {
  assertInsideTarget(targetDir);
  rmSync(targetDir, { recursive: true, force: true });
}
mkdirSync(layoutDir, { recursive: true });
mkdirSync(outputDir, { recursive: true });

copyFile(desktopExePath, resolve(layoutDir, config.executable));
copyFile(sidecarManifestPath, resolve(layoutDir, "binaries/sidecar-manifest.json"));
copyFile(sidecarPath, resolve(layoutDir, "binaries", sidecarManifest.fileName));
copyFile(noticesPath, resolve(layoutDir, "binaries", sidecarManifest.noticesFile));
copyFile(
  thirdPartyNoticesPath,
  resolve(layoutDir, "binaries", sidecarManifest.thirdPartyNoticesFile)
);
copyDirectory(runtimeDir, resolve(layoutDir, "binaries", sidecarManifest.runtimeDirectory));
copyFile(resolve(root, "LICENSE"), resolve(layoutDir, "LICENSE.txt"));

const iconsDir = resolve(tauriDir, "icons");
const storeIconNames = readdirSync(iconsDir).filter((name) =>
  /^(?:StoreLogo|Square\d+x\d+Logo)\.png$/u.test(name)
);
for (const name of storeIconNames) {
  copyFile(resolve(iconsDir, name), resolve(layoutDir, "Assets", name));
}
for (const required of ["StoreLogo.png", "Square44x44Logo.png", "Square150x150Logo.png"]) {
  assert(
    existsSync(resolve(layoutDir, "Assets", required)),
    `Required Store icon is missing: ${required}`
  );
}

const packageResourceLanguages = config.packageResourceLanguages.map((language) =>
  xmlEscape(language)
);
const resourceLanguages = renderPackageResourceLanguages(packageResourceLanguages);
const manifest = renderTemplate(
  readFileSync(templatePath, "utf8"),
  {
    IDENTITY_NAME: config.identity.name,
    PUBLISHER: config.identity.publisher,
    VERSION: config.identity.version,
    PROCESSOR_ARCHITECTURE: config.identity.processorArchitecture,
    DISPLAY_NAME: config.displayName,
    PUBLISHER_DISPLAY_NAME: config.identity.publisherDisplayName,
    DESCRIPTION: config.description,
    TARGET_DEVICE_FAMILY: config.targetDeviceFamily.name,
    MIN_VERSION: config.targetDeviceFamily.minVersion,
    MAX_VERSION_TESTED: config.targetDeviceFamily.maxVersionTested,
    APPLICATION_ID: config.applicationId,
    EXECUTABLE: config.executable
  },
  { RESOURCE_LANGUAGES: resourceLanguages }
);
assertPackageResourceModel({
  packageResourceLanguages,
  manifestText: manifest,
  resourcesPriExists: false
});
writeFileSync(resolve(layoutDir, "AppxManifest.xml"), manifest, "utf8");

const sdk = findMakeAppx();
const packagePath = resolve(outputDir, config.packageFileName);
const result = spawnSync(sdk.path, ["pack", "/d", layoutDir, "/p", packagePath, "/o"], {
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
  windowsHide: true
});
const success = result.status === 0 && existsSync(packagePath);
const gates = evaluateStoreGates({
  packageBuilt: success,
  makeAppxValidated: success,
  wackOverall: wack.overall,
  sidecarProductionReady: sidecarManifest.productionReady,
  licenseReviewApproved: sidecarManifest.licenseReviewStatus === "approved",
  installedPackageGuiQaPassed: false,
  partnerCenterFormsComplete: false
});
const buildManifest: BuildManifest = {
  schemaVersion: 3,
  generatedAt: new Date().toISOString(),
  status: success ? "success" : "failed",
  artifactKind: "microsoft-store-msix",
  productId: config.productId,
  unsigned: true,
  productionReady: false,
  storeUploadPerformed: false,
  storeUploadEligible: gates.storeUploadEligible,
  certificationEligible: gates.certificationEligible,
  localTrustedSignatureRequiredForStoreUpload: gates.localTrustedSignatureRequiredForStoreUpload,
  package: success
    ? {
        fileName: config.packageFileName,
        sizeBytes: statSync(packagePath).size,
        sha256: sha256(packagePath)
      }
    : null,
  identity: config.identity,
  targetDeviceFamily: config.targetDeviceFamily,
  application: {
    id: config.applicationId,
    executable: config.executable,
    runtimeBehavior: "packagedClassicApp",
    trustLevel: "mediumIL",
    restrictedCapability: "runFullTrust"
  },
  languages,
  packageResourceLanguages,
  localizationModel: "bundled-json-with-literal-msix-manifest",
  inputs: {
    desktopExeSha256: sha256(desktopExePath),
    sidecarSha256: sha256(sidecarPath),
    sidecarArtifactKind: sidecarManifest.artifactKind,
    sidecarProductionReady: sidecarManifest.productionReady,
    sidecarLicenseReviewStatus: sidecarManifest.licenseReviewStatus,
    baseTauriConfigSha256: sha256(baseTauriConfigPath),
    storeTauriConfigSha256: sha256(storeTauriConfigPath),
    noticesSha256: sha256(noticesPath),
    thirdPartyNoticesSha256: sha256(thirdPartyNoticesPath)
  },
  sdk: {
    makeAppxVersion: sdk.version
  },
  wack,
  gateInputs: {
    packageBuilt: success,
    makeAppxValidated: success,
    wackOverall: wack.overall,
    sidecarProductionReady: sidecarManifest.productionReady,
    licenseReviewApproved: sidecarManifest.licenseReviewStatus === "approved",
    installedPackageGuiQaPassed: false,
    partnerCenterFormsComplete: false
  },
  storeUploadBlockers: gates.storeUploadBlockers,
  certificationBlockers: gates.certificationBlockers,
  advisories: gates.advisories,
  limitations: [
    "This MSIX is unsigned and is not approved for direct sideload distribution; that does not block Microsoft Store upload because the Store re-signs certified MSIX packages.",
    "The package has not been uploaded to Partner Center and no Store submission was created by this script.",
    wack.overall === "PASS"
      ? "A local WACK overall PASS is recorded; official Partner Center certification remains authoritative."
      : "No passing local WACK result is recorded; official Partner Center certification remains authoritative.",
    "Installed-package GUI smoke testing and Partner Center submission fields remain incomplete.",
    "The sidecar manifest remains productionReady=false until license and release review are completed.",
    "Only x64 Windows 11 devices are represented by this package."
  ]
};
writeBuildManifest(buildManifest);

if (!success) {
  process.stderr.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  throw new Error(`MakeAppx failed with exit code ${result.status ?? 1}.`);
}

const makeAppxSummary = (result.stdout ?? "").trim().split(/\r?\n/u).slice(-8).join("\n");
if (makeAppxSummary.length > 0) {
  console.log(makeAppxSummary);
}
console.log(`Unsigned Microsoft Store MSIX written to ${packagePath}`);
console.log(`Store build manifest written to ${buildManifestPath}`);
