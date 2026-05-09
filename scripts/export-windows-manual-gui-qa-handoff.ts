import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

interface HandoffFile {
  role: string;
  fileName: string;
  source: string;
  sha256: string;
  sizeBytes: number;
}

interface WindowsManualGuiQaHandoff {
  schemaVersion: 1;
  generatedAt: string;
  evidenceKind: "windows-manual-gui-qa-handoff";
  status: "handoff_ready";
  productionReady: false;
  unsignedDraft: true;
  manualGuiQaStatus: string;
  handoffDirectory: "lumatrace-windows-manual-gui-qa-handoff";
  files: HandoffFile[];
  excludedFiles: string[];
  instructions: string[];
  securityAssertions: {
    tokenRedacted: true;
    fullLocalPathsRedacted: true;
    rawLogsExcluded: true;
    rawStdoutStderrExcluded: true;
    manualReviewerNotesExcluded: true;
    publicSidecarListenersAllowed: false;
  };
  limitations: string[];
}

const root = process.cwd();
const releaseDir = resolve(root, "apps/desktop/src-tauri/target/release");
const binariesDir = resolve(root, "apps/desktop/src-tauri/binaries");
const checklistPath = resolve(root, "docs/windows-packaging-manual-gui-checklist.md");
const handoffDir = resolve(releaseDir, "lumatrace-windows-manual-gui-qa-handoff");
const handoffManifestPath = resolve(releaseDir, "lumatrace-windows-manual-gui-qa-handoff-manifest.json");

const sourceFiles = [
  {
    role: "manual checklist",
    path: checklistPath,
    outputName: "windows-packaging-manual-gui-checklist.md"
  },
  {
    role: "pending manual QA template",
    path: resolve(releaseDir, "lumatrace-windows-manual-gui-qa-template.json")
  },
  {
    role: "automated packaging QA evidence",
    path: resolve(releaseDir, "lumatrace-windows-packaging-qa-evidence.json")
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
    role: "sidecar manifest",
    path: resolve(binariesDir, "sidecar-manifest.json")
  },
  {
    role: "packaging notice manifest",
    path: resolve(binariesDir, "packaging-notices.json")
  },
  {
    role: "third-party notices draft",
    path: resolve(binariesDir, "THIRD-PARTY-NOTICES.md")
  }
] as const;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
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
    !/"(?:rawLog|rawLogs|stdout|stderr|commandLine|rawCsv|stack)"\s*:/iu.test(normalized) &&
    !/\bat\s+[^\r\n]+:\d+:\d+/u.test(normalized) &&
    !/"productionReady"\s*:\s*true/u.test(normalized)
  );
}

function readManualStatus(): string {
  const evidencePath = resolve(releaseDir, "lumatrace-windows-packaging-qa-evidence.json");
  if (!existsSync(evidencePath)) {
    return "unknown";
  }
  const evidence = JSON.parse(readFileSync(evidencePath, "utf8")) as {
    manualGuiQa?: { status?: unknown };
  };
  return typeof evidence.manualGuiQa?.status === "string" ? evidence.manualGuiQa.status : "unknown";
}

function writeReadme(manualGuiQaStatus: string): string {
  const readme = `# LumaTrace Windows Manual GUI QA Handoff

This directory is a sanitized handoff bundle for the unsigned Windows packaging draft.

It is intended for a human QA reviewer to run the installed-app checklist and then create a separate \`lumatrace-windows-manual-gui-qa-result.json\` from the included pending template.

## Current Status

- handoff status: handoff_ready
- manual GUI QA status: ${manualGuiQaStatus}
- productionReady: false
- unsigned draft: true
- code signing: not configured
- updater: not configured
- release approval: not granted

## How To Use

1. Install the unsigned Windows installer draft on a QA machine or temporary VM.
2. Follow \`windows-packaging-manual-gui-checklist.md\`.
3. Fill a separate result JSON from \`lumatrace-windows-manual-gui-qa-template.json\`.
4. Run \`pnpm verify:windows-manual-gui-qa-result path/to/result.json\`.
5. Do not edit the automated evidence files in this handoff directory.

## Privacy And Safety

- This handoff excludes auth tokens, raw logs, raw stdout/stderr, command lines, stack traces, logcat, bugreport, raw CSV, Android full serials, and full local user paths.
- This handoff does not include manual reviewer notes or a completed manual result.
- Passing a future manual GUI QA result still does not configure code signing, updater behavior, or production release approval.
`;
  const readmePath = resolve(handoffDir, "README.md");
  writeFileSync(readmePath, readme, "utf8");
  return readmePath;
}

for (const file of sourceFiles) {
  if (!existsSync(file.path)) {
    fail(`Required handoff source is missing: ${file.role} (${file.path})`);
  }
  if (!hasCleanText(readFileSync(file.path, "utf8"))) {
    fail(`Required handoff source is not sanitized: ${file.role}`);
  }
}

rmSync(handoffDir, { recursive: true, force: true });
mkdirSync(handoffDir, { recursive: true });

const manualGuiQaStatus = readManualStatus();
const copiedFiles: HandoffFile[] = [];
for (const file of sourceFiles) {
  const fileName = "outputName" in file && file.outputName !== undefined ? file.outputName : basename(file.path);
  const destination = resolve(handoffDir, fileName);
  copyFileSync(file.path, destination);
  copiedFiles.push({
    role: file.role,
    fileName,
    source: file.role,
    sha256: sha256(destination),
    sizeBytes: statSync(destination).size
  });
}

const readmePath = writeReadme(manualGuiQaStatus);
copiedFiles.unshift({
  role: "handoff instructions",
  fileName: "README.md",
  source: "generated",
  sha256: sha256(readmePath),
  sizeBytes: statSync(readmePath).size
});

const handoff: WindowsManualGuiQaHandoff = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  evidenceKind: "windows-manual-gui-qa-handoff",
  status: "handoff_ready",
  productionReady: false,
  unsignedDraft: true,
  manualGuiQaStatus,
  handoffDirectory: "lumatrace-windows-manual-gui-qa-handoff",
  files: copiedFiles,
  excludedFiles: [
    "lumatrace-windows-manual-gui-qa-result.json",
    "raw logs",
    "raw stdout/stderr",
    "command lines",
    "stack traces",
    "logcat",
    "bugreport",
    "raw PresentMon CSV",
    "auth token"
  ],
  instructions: [
    "Use this handoff only as an input to human manual GUI QA.",
    "Do not mark manual GUI QA as passed without a separately filled and verified result JSON.",
    "Run pnpm verify:windows-manual-gui-qa-result path/to/result.json after manual QA.",
    "productionReady must remain false until code signing, updater policy, license review, and release approval are complete."
  ],
  securityAssertions: {
    tokenRedacted: true,
    fullLocalPathsRedacted: true,
    rawLogsExcluded: true,
    rawStdoutStderrExcluded: true,
    manualReviewerNotesExcluded: true,
    publicSidecarListenersAllowed: false
  },
  limitations: [
    "This is an unsigned Windows manual GUI QA handoff bundle, not a production release.",
    "The handoff does not include a completed manual GUI QA result.",
    "The handoff does not configure code signing, updater behavior, or release approval.",
    "productionReady remains false."
  ]
};

mkdirSync(dirname(handoffManifestPath), { recursive: true });
writeFileSync(handoffManifestPath, `${JSON.stringify(handoff, null, 2)}\n`, "utf8");
writeFileSync(resolve(handoffDir, "lumatrace-windows-manual-gui-qa-handoff-manifest.json"), `${JSON.stringify(handoff, null, 2)}\n`, "utf8");

if (!hasCleanText(JSON.stringify(handoff))) {
  fail("Generated handoff manifest is not sanitized");
}

console.log(`Windows manual GUI QA handoff written to ${handoffDir}`);
console.log(`Windows manual GUI QA handoff manifest written to ${handoffManifestPath}`);
console.log(`manualGuiQaStatus=${manualGuiQaStatus}`);
