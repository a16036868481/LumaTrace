import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

interface ReviewerBundleFile {
  role: string;
  fileName: string;
  source: string;
  sha256: string;
  sizeBytes: number;
  status?: JsonValue;
  productionReady?: JsonValue;
}

interface WindowsRcReviewerBundle {
  schemaVersion: 1;
  generatedAt: string;
  evidenceKind: "windows-rc-reviewer-bundle";
  status: "review_bundle_ready";
  rcCandidateReady: false;
  productionReady: false;
  unsignedDraft: true;
  bundleDirectory: "lumatrace-windows-rc-reviewer-bundle";
  files: ReviewerBundleFile[];
  blockers: string[];
  reviewerInstructions: string[];
  excludedFiles: string[];
  securityAssertions: {
    tokenRedacted: true;
    fullLocalPathsRedacted: true;
    rawLogsExcluded: true;
    rawStdoutStderrExcluded: true;
    rawLicenseTextExcluded: true;
    reviewerNotesExcluded: true;
    publicSidecarListenersAllowed: false;
  };
  limitations: string[];
}

const root = process.cwd();
const releaseDir = resolve(root, "apps/desktop/src-tauri/target/release");
const binariesDir = resolve(root, "apps/desktop/src-tauri/binaries");
const bundleDir = resolve(releaseDir, "lumatrace-windows-rc-reviewer-bundle");
const bundleManifestPath = resolve(releaseDir, "lumatrace-windows-rc-reviewer-bundle-manifest.json");

const sourceFiles = [
  {
    role: "Windows packaging QA evidence",
    path: resolve(releaseDir, "lumatrace-windows-packaging-qa-evidence.json")
  },
  {
    role: "Windows packaging release readiness",
    path: resolve(releaseDir, "lumatrace-windows-packaging-release-readiness.json")
  },
  {
    role: "Windows packaging RC gate",
    path: resolve(releaseDir, "lumatrace-windows-packaging-rc-gate.json")
  },
  {
    role: "Windows release policy template",
    path: resolve(releaseDir, "lumatrace-windows-release-policy-template.json")
  },
  {
    role: "Windows sidecar production readiness template",
    path: resolve(releaseDir, "lumatrace-windows-sidecar-production-readiness-template.json")
  },
  {
    role: "Windows license review template",
    path: resolve(releaseDir, "lumatrace-windows-license-review-template.json")
  },
  {
    role: "Windows code signing readiness template",
    path: resolve(releaseDir, "lumatrace-windows-code-signing-readiness-template.json")
  },
  {
    role: "Windows updater policy readiness template",
    path: resolve(releaseDir, "lumatrace-windows-updater-policy-readiness-template.json")
  },
  {
    role: "Windows release approval readiness template",
    path: resolve(releaseDir, "lumatrace-windows-release-approval-readiness-template.json")
  },
  {
    role: "Windows manual GUI QA template",
    path: resolve(releaseDir, "lumatrace-windows-manual-gui-qa-template.json")
  },
  {
    role: "Windows manual GUI QA handoff manifest",
    path: resolve(releaseDir, "lumatrace-windows-manual-gui-qa-handoff-manifest.json")
  },
  {
    role: "Sidecar manifest",
    path: resolve(binariesDir, "sidecar-manifest.json")
  },
  {
    role: "Packaging notice manifest",
    path: resolve(binariesDir, "packaging-notices.json")
  }
] as const;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readJson(path: string): Record<string, JsonValue> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, JsonValue>;
}

function hasCleanText(text: string): boolean {
  const normalized = text.replace(/\\\\/gu, "\\");
  return (
    !/Bearer\s+[A-Za-z0-9._~+/=-]+/u.test(normalized) &&
    !/lumatrace-auth\.[A-Za-z0-9._~+/=-]+/u.test(normalized) &&
    !/--auth-token\s+[A-Za-z0-9._~+/=-]+/u.test(normalized) &&
    !/"(?:authToken|token)"\s*:\s*"[^"]{8,}"/u.test(normalized) &&
    !/[A-Z]:\\(?:Users|Documents and Settings|ProgramData|Windows|Temp)\\/iu.test(normalized) &&
    !/\/(?:Users|home)\/[^/\s"]+/iu.test(normalized) &&
    !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(normalized) &&
    !/"(?:rawLog|rawLogs|stdout|stderr|commandLine|rawCsv|stack|reviewerNotes|evidenceNotes)"\s*:/iu.test(
      normalized
    ) &&
    !/\bat\s+[^\r\n]+:\d+:\d+/u.test(normalized) &&
    !/"productionReady"\s*:\s*true/u.test(normalized) &&
    !/"rcCandidateReady"\s*:\s*true/u.test(normalized)
  );
}

function field(document: Record<string, JsonValue>, name: string): JsonValue | undefined {
  return Object.prototype.hasOwnProperty.call(document, name) ? document[name] : undefined;
}

function readRcBlockers(): string[] {
  const rcGatePath = resolve(releaseDir, "lumatrace-windows-packaging-rc-gate.json");
  if (!existsSync(rcGatePath)) {
    return [];
  }
  const rcGate = readJson(rcGatePath);
  const blockers = rcGate.blockers;
  if (!Array.isArray(blockers)) {
    return [];
  }
  return blockers
    .map((blocker) => {
      if (blocker === null || Array.isArray(blocker) || typeof blocker !== "object") {
        return undefined;
      }
      return typeof blocker.code === "string" ? blocker.code : undefined;
    })
    .filter((code): code is string => code !== undefined);
}

function writeReadme(blockers: string[]): string {
  const readme = `# LumaTrace Windows RC Reviewer Bundle

This directory is a sanitized reviewer bundle for the unsigned Windows packaging draft.

It is intended to help a release reviewer inspect the current RC blockers and evidence manifests in one place. It is not release approval.

## Current Status

- bundle status: review_bundle_ready
- rcCandidateReady: false
- productionReady: false
- unsigned draft: true
- remaining blockers: ${blockers.length === 0 ? "unknown" : blockers.join(", ")}

## How To Use

1. Review \`lumatrace-windows-packaging-rc-gate.json\` first.
2. Review each readiness template for its blocker-specific missing evidence.
3. Run manual GUI QA separately and verify a result with \`pnpm verify:windows-manual-gui-qa-result path/to/result.json\`.
4. Do not mark this bundle as approval. Approval must be a separate reviewed release evidence file.

## Privacy And Safety

- This bundle excludes auth tokens, raw logs, raw stdout/stderr, command lines, raw CSV, raw license text, reviewer notes, evidence notes, logcat, bugreport, Android full serials, stack traces, and full local user paths.
- This bundle includes JSON evidence manifests and generated instructions only.
- Passing a future manual GUI QA result still does not configure signing, updater behavior, sidecar production readiness, or release approval.
`;
  const readmePath = resolve(bundleDir, "README.md");
  writeFileSync(readmePath, readme, "utf8");
  return readmePath;
}

for (const file of sourceFiles) {
  if (!existsSync(file.path)) {
    fail(`Required reviewer bundle source is missing: ${file.role} (${file.path})`);
  }
  if (!hasCleanText(readFileSync(file.path, "utf8"))) {
    fail(`Required reviewer bundle source is not sanitized: ${file.role}`);
  }
}

rmSync(bundleDir, { recursive: true, force: true });
mkdirSync(bundleDir, { recursive: true });

const blockers = readRcBlockers();
const copiedFiles: ReviewerBundleFile[] = [];

for (const file of sourceFiles) {
  const fileName = basename(file.path);
  const destination = resolve(bundleDir, fileName);
  copyFileSync(file.path, destination);
  const document = readJson(destination);
  copiedFiles.push({
    role: file.role,
    fileName,
    source: file.role,
    sha256: sha256(destination),
    sizeBytes: statSync(destination).size,
    ...(field(document, "status") === undefined ? {} : { status: field(document, "status") }),
    ...(field(document, "productionReady") === undefined ? {} : { productionReady: field(document, "productionReady") })
  });
}

const readmePath = writeReadme(blockers);
copiedFiles.unshift({
  role: "reviewer instructions",
  fileName: "README.md",
  source: "generated",
  sha256: sha256(readmePath),
  sizeBytes: statSync(readmePath).size
});

const manifest: WindowsRcReviewerBundle = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  evidenceKind: "windows-rc-reviewer-bundle",
  status: "review_bundle_ready",
  rcCandidateReady: false,
  productionReady: false,
  unsignedDraft: true,
  bundleDirectory: "lumatrace-windows-rc-reviewer-bundle",
  files: copiedFiles,
  blockers,
  reviewerInstructions: [
    "Use this bundle as a read-only evidence packet for release review.",
    "Do not treat this bundle as production approval.",
    "Manual GUI QA, license approval, code signing, updater policy, sidecar production readiness, and release approval must remain separate release gates.",
    "productionReady must remain false until all release gates have approved evidence."
  ],
  excludedFiles: [
    "raw logs",
    "raw stdout/stderr",
    "command lines",
    "raw PresentMon CSV",
    "raw license text",
    "reviewer notes",
    "evidence notes",
    "logcat",
    "bugreport",
    "Android full serial",
    "auth token"
  ],
  securityAssertions: {
    tokenRedacted: true,
    fullLocalPathsRedacted: true,
    rawLogsExcluded: true,
    rawStdoutStderrExcluded: true,
    rawLicenseTextExcluded: true,
    reviewerNotesExcluded: true,
    publicSidecarListenersAllowed: false
  },
  limitations: [
    "This is an unsigned Windows RC reviewer bundle, not a production release.",
    "This bundle does not include a completed manual GUI QA result unless separately verified and aggregated elsewhere.",
    "This bundle does not configure code signing, updater behavior, sidecar production readiness, or release approval.",
    "productionReady remains false."
  ]
};

mkdirSync(dirname(bundleManifestPath), { recursive: true });
writeFileSync(bundleManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
writeFileSync(resolve(bundleDir, "lumatrace-windows-rc-reviewer-bundle-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

if (!hasCleanText(JSON.stringify(manifest))) {
  fail("Generated reviewer bundle manifest is not sanitized");
}

console.log(`Windows RC reviewer bundle written to ${bundleDir}`);
console.log(`Windows RC reviewer bundle manifest written to ${bundleManifestPath}`);
console.log(`blockers=${blockers.join(",")}`);
