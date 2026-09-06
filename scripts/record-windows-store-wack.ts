import { createHash } from "node:crypto";
import { basename, resolve } from "node:path";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { evaluateStoreGates, parseWackReport, type StoreGateInput } from "./windows-store-gates.ts";

interface StoreConfig {
  displayName: string;
  identity: {
    name: string;
    version: string;
    processorArchitecture: string;
  };
  packageFileName: string;
}

interface BuildManifest {
  package?: { fileName?: string; sizeBytes?: number; sha256?: string } | null;
  wack?: Record<string, unknown>;
  gateInputs?: StoreGateInput;
  storeUploadEligible?: boolean;
  certificationEligible?: boolean;
  storeUploadBlockers?: unknown[];
  certificationBlockers?: unknown[];
  advisories?: unknown[];
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readTextFile(path: string): string {
  const bytes = readFileSync(path);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return bytes.subarray(2).toString("utf16le");
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return bytes.subarray(3).toString("utf8");
  }
  return bytes.toString("utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const reportArgument = process.argv[2]?.trim();
assert(reportArgument !== undefined && reportArgument.length > 0, "Pass the WACK XML or HTML report path.");

const root = process.cwd();
const tauriDir = resolve(root, "apps/desktop/src-tauri");
const targetDir = resolve(tauriDir, "target/store-msix");
const configPath = resolve(tauriDir, "store/store-config.json");
const buildManifestPath = resolve(targetDir, "build-manifest.json");
const reportPath = resolve(reportArgument);
assert(existsSync(configPath), "Store config is missing.");
assert(existsSync(buildManifestPath), "Store build manifest is missing.");
assert(existsSync(reportPath), `WACK report is missing: ${reportPath}`);

const config = readJson<StoreConfig>(configPath);
const manifest = readJson<BuildManifest>(buildManifestPath);
const packagePath = resolve(targetDir, "output", config.packageFileName);
assert(existsSync(packagePath), `MSIX package is missing: ${packagePath}`);
const packageHash = sha256(packagePath);
const packageSize = statSync(packagePath).size;
assert(manifest.package?.fileName === config.packageFileName, "Build manifest package file name is stale.");
assert(manifest.package?.sizeBytes === packageSize, "Build manifest package size is stale.");
assert(manifest.package?.sha256 === packageHash, "Build manifest package hash is stale.");

const report = readTextFile(reportPath);
const parsed = parseWackReport(report);
assert(parsed.overall === "PASS", "WACK overall result must be PASS before recording release evidence.");
const htmlIdentityMatched =
  report.includes(config.displayName) &&
  report.includes(config.identity.version) &&
  new RegExp(`>\\s*${config.identity.processorArchitecture}\\s*<`, "iu").test(report);
const xmlIdentityMatched =
  report.includes(`APP_NAME="${config.identity.name}"`) &&
  report.includes(`APP_VERSION="${config.identity.version}"`) &&
  report.includes(`TOOLSET_ARCHITECTURE="${config.identity.processorArchitecture}"`);
assert(
  htmlIdentityMatched || xmlIdentityMatched,
  "WACK report does not match the Store identity, version, and architecture."
);
assert(manifest.gateInputs !== undefined, "Store gate inputs are missing from the build manifest.");

const gateInputs: StoreGateInput = { ...manifest.gateInputs, wackOverall: parsed.overall };
const gates = evaluateStoreGates(gateInputs);
manifest.wack = {
  overall: parsed.overall,
  reportRecorded: true,
  reportFileName: basename(reportPath),
  reportSha256: sha256(reportPath),
  ...(parsed.kitVersion === undefined ? {} : { kitVersion: parsed.kitVersion }),
  packageIdentityVersionArchitectureMatched: true,
  testedPackageSha256: packageHash,
  requiredForStoreUpload: false,
  note: "WACK overall PASS is bound to the exact generated MSIX SHA-256; official Partner Center certification remains authoritative."
};
manifest.gateInputs = gateInputs;
manifest.storeUploadEligible = gates.storeUploadEligible;
manifest.certificationEligible = gates.certificationEligible;
manifest.storeUploadBlockers = gates.storeUploadBlockers;
manifest.certificationBlockers = gates.certificationBlockers;
manifest.advisories = gates.advisories;
writeFileSync(buildManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(`Recorded WACK PASS for ${config.packageFileName}`);
console.log(`MSIX SHA-256: ${packageHash}`);
console.log(`WACK report: ${reportPath}`);
