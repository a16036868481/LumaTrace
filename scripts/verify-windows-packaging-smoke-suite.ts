import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

interface ManifestCheck {
  name: string;
  fileName: string;
  required: Array<[string, (manifest: Record<string, unknown>) => boolean]>;
}

interface ManifestSummary {
  name: string;
  fileName: string;
  generatedAt?: unknown;
  status?: unknown;
  productionReady?: unknown;
  passed: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
  }>;
}

interface SuiteManifest {
  schemaVersion: 1;
  generatedAt: string;
  status: "success" | "failed";
  suiteKind: "windows-packaging-smoke-suite";
  productionReady: false;
  unsigned: true;
  manifests: ManifestSummary[];
  warnings: string[];
  limitations: string[];
}

const root = process.cwd();
const releaseDir = resolve(root, "apps/desktop/src-tauri/target/release");
const suiteManifestPath = resolve(releaseDir, "lumatrace-windows-packaging-smoke-suite-manifest.json");

const manifestChecks: ManifestCheck[] = [
  {
    name: "Tauri sidecar auth transport smoke",
    fileName: "lumatrace-tauri-sidecar-auth-transport-smoke-manifest.json",
    required: [
      ["status success", (manifest) => manifest.status === "success"],
      ["smoke kind is Tauri dev sidecar auth transport", (manifest) => manifest.smokeKind === "tauri-dev-sidecar-auth-transport"],
      ["unsigned", (manifest) => manifest.unsigned === true],
      ["productionReady false", (manifest) => manifest.productionReady === false],
      ["desktop observed", (manifest) => nestedBoolean(manifest, ["checks", "desktopObserved"]) === true],
      ["sidecar observed", (manifest) => nestedBoolean(manifest, ["checks", "sidecarObserved"]) === true],
      ["sidecar has no auth arg", (manifest) => nestedBoolean(manifest, ["checks", "sidecarCommandLineContainsAuthArg"]) === false],
      ["sidecar has no bearer token", (manifest) => nestedBoolean(manifest, ["checks", "sidecarCommandLineContainsBearer"]) === false],
      ["sidecar has no WS auth token", (manifest) => nestedBoolean(manifest, ["checks", "sidecarCommandLineContainsWsAuth"]) === false],
      ["sidecar binds localhost", (manifest) => nestedBoolean(manifest, ["checks", "sidecarBindsLocalhost"]) === true],
      ["sidecar does not bind public", (manifest) => nestedBoolean(manifest, ["checks", "sidecarBindsPublic"]) === false],
      ["raw command line excluded", (manifest) => nestedBoolean(manifest, ["evidence", "sidecarCommandLineRawIncluded"]) === false]
    ]
  },
  {
    name: "portable bundle draft",
    fileName: "lumatrace-bundle-draft-manifest.json",
    required: [
      ["bundleKind is portable-release-directory", (manifest) => manifest.bundleKind === "portable-release-directory"],
      ["unsigned", (manifest) => manifest.unsigned === true],
      ["installerBuilt false", (manifest) => manifest.installerBuilt === false],
      ["productionReady false", (manifest) => manifest.productionReady === false],
      ["code signing not configured", (manifest) => manifest.codeSigningConfigured === false],
      ["updater not configured", (manifest) => manifest.updaterConfigured === false]
    ]
  },
  {
    name: "installer draft",
    fileName: "lumatrace-installer-draft-manifest.json",
    required: [
      ["status success", (manifest) => manifest.status === "success"],
      ["bundleKind is windows-nsis-installer-draft", (manifest) => manifest.bundleKind === "windows-nsis-installer-draft"],
      ["unsigned", (manifest) => manifest.unsigned === true],
      ["installerBuilt true", (manifest) => manifest.installerBuilt === true],
      ["productionReady false", (manifest) => manifest.productionReady === false],
      ["code signing not configured", (manifest) => manifest.codeSigningConfigured === false],
      ["updater not configured", (manifest) => manifest.updaterConfigured === false]
    ]
  },
  {
    name: "installer install/uninstall smoke",
    fileName: "lumatrace-installer-smoke-manifest.json",
    required: [
      ["status success", (manifest) => manifest.status === "success"],
      ["install mode is temp dir", (manifest) => manifest.installMode === "nsis-silent-temp-dir"],
      ["unsigned", (manifest) => manifest.unsigned === true],
      ["productionReady false", (manifest) => manifest.productionReady === false],
      ["uninstalled", (manifest) => manifest.uninstalled === true]
    ]
  },
  {
    name: "installed app launch smoke",
    fileName: "lumatrace-installed-app-launch-smoke-manifest.json",
    required: [
      ["status success", (manifest) => manifest.status === "success"],
      ["launch mode is temp install launch", (manifest) => manifest.launchMode === "nsis-silent-temp-install-launch"],
      ["unsigned", (manifest) => manifest.unsigned === true],
      ["productionReady false", (manifest) => manifest.productionReady === false],
      ["app started", (manifest) => nestedBoolean(manifest, ["launch", "started"]) === true],
      ["app PID observed", (manifest) => nestedBoolean(manifest, ["launch", "pidObserved"]) === true],
      ["cleanup uninstalled", (manifest) => nestedBoolean(manifest, ["cleanup", "uninstalled"]) === true]
    ]
  },
  {
    name: "installed sidecar health smoke",
    fileName: "lumatrace-installed-sidecar-health-smoke-manifest.json",
    required: [
      ["status success", (manifest) => manifest.status === "success"],
      ["smoke kind is sidecar health", (manifest) => manifest.smokeKind === "nsis-installed-sidecar-health"],
      ["unsigned", (manifest) => manifest.unsigned === true],
      ["productionReady false", (manifest) => manifest.productionReady === false],
      ["sidecar process observed", (manifest) => nestedBoolean(manifest, ["sidecarHealth", "processObserved"]) === true],
      ["listener observed", (manifest) => nestedBoolean(manifest, ["sidecarHealth", "listenerObserved"]) === true],
      ["public listener count zero", (manifest) => nestedNumber(manifest, ["sidecarHealth", "publicListenerCount"]) === 0],
      ["cleanup uninstalled", (manifest) => nestedBoolean(manifest, ["cleanup", "uninstalled"]) === true]
    ]
  },
  {
    name: "release gate results suite smoke",
    fileName: "lumatrace-windows-release-gate-results-suite-smoke-manifest.json",
    required: [
      ["status success", (manifest) => manifest.status === "success"],
      ["suite kind is release gate results", (manifest) => manifest.suiteKind === "windows-release-gate-results-suite"],
      ["unsigned", (manifest) => manifest.unsigned === true],
      ["productionReady false", (manifest) => manifest.productionReady === false],
      ["RC candidate false", (manifest) => manifest.rcCandidateReady === false],
      ["previous files restored", (manifest) => manifest.restoredPreviousFiles === true],
      [
        "four intake cases passed",
        (manifest) =>
          Array.isArray(manifest.cases) &&
          manifest.cases.length === 4 &&
          manifest.cases.every((item) => {
            if (item === null || Array.isArray(item) || typeof item !== "object") {
              return false;
            }
            return (item as Record<string, unknown>).status === "passed";
          })
      ]
    ]
  }
];

function nestedValue(manifest: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = manifest;
  for (const segment of path) {
    if (typeof current !== "object" || current === null || !(segment in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function nestedBoolean(manifest: Record<string, unknown>, path: string[]): boolean | undefined {
  const value = nestedValue(manifest, path);
  return typeof value === "boolean" ? value : undefined;
}

function nestedNumber(manifest: Record<string, unknown>, path: string[]): number | undefined {
  const value = nestedValue(manifest, path);
  return typeof value === "number" ? value : undefined;
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function hasCleanText(text: string): boolean {
  return (
    !/Bearer\s+[A-Za-z0-9._~+/=-]+/u.test(text) &&
    !/lumatrace-auth\.[A-Za-z0-9._~+/=-]+/u.test(text) &&
    !/[A-Z]:\\Users\\|\/(?:Users|home)\//iu.test(text) &&
    !/\bat\s+[^\r\n]+:\d+:\d+/u.test(text) &&
    !/"productionReady"\s*:\s*true/u.test(text)
  );
}

function summarize(check: ManifestCheck): ManifestSummary {
  const path = resolve(releaseDir, check.fileName);
  if (!existsSync(path)) {
    return {
      name: check.name,
      fileName: check.fileName,
      passed: false,
      checks: [{ name: "manifest exists", passed: false }]
    };
  }

  const text = readFileSync(path, "utf8");
  const manifest = readJson(path);
  const checks = [
    { name: "manifest exists", passed: true },
    { name: "manifest is sanitized", passed: hasCleanText(text) },
    ...check.required.map(([name, predicate]) => ({ name, passed: predicate(manifest) }))
  ];

  return {
    name: check.name,
    fileName: check.fileName,
    generatedAt: manifest.generatedAt,
    status: manifest.status ?? manifest.bundleKind ?? manifest.smokeKind,
    productionReady: manifest.productionReady,
    passed: checks.every((item) => item.passed),
    checks
  };
}

function writeSuiteManifest(manifests: ManifestSummary[]): void {
  const suite: SuiteManifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: manifests.every((manifest) => manifest.passed) ? "success" : "failed",
    suiteKind: "windows-packaging-smoke-suite",
    productionReady: false,
    unsigned: true,
    manifests,
    warnings: [
      "Individual smoke manifests may reference different installer hashes because each smoke can rebuild the unsigned draft independently."
    ],
    limitations: [
      "This suite verifies sanitized smoke manifests for the unsigned Windows packaging draft.",
      "It does not run production signing, updater validation, store distribution, or release approval.",
      "productionReady remains false."
    ]
  };

  mkdirSync(dirname(suiteManifestPath), { recursive: true });
  writeFileSync(suiteManifestPath, `${JSON.stringify(suite, null, 2)}\n`, "utf8");
}

const summaries = manifestChecks.map(summarize);
writeSuiteManifest(summaries);

for (const summary of summaries) {
  console.log(`${summary.passed ? "[ok]" : "[fail]"} ${summary.name}: ${summary.fileName}`);
  for (const check of summary.checks) {
    console.log(`  ${check.passed ? "[ok]" : "[fail]"} ${check.name}`);
  }
}

const suiteText = readFileSync(suiteManifestPath, "utf8");
const suiteIsClean = hasCleanText(suiteText);
console.log(`${suiteIsClean ? "[ok]" : "[fail]"} suite manifest is sanitized`);
if (!suiteIsClean || summaries.some((summary) => !summary.passed)) {
  console.error(`Windows packaging smoke suite verification failed. Manifest written to ${suiteManifestPath}`);
  process.exit(1);
}

console.log(`Windows packaging smoke suite manifest written to ${suiteManifestPath}`);
console.log("Windows packaging smoke suite verification passed");
