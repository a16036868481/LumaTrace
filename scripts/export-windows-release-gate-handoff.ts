import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

interface ReleaseGateHandoffFile {
  role: string;
  fileName: string;
  source: string;
  sha256: string;
  sizeBytes: number;
  status?: JsonValue;
}

interface ReleaseGateAction {
  gate: string;
  blockerCode: string;
  templateFile: string;
  resultFile: string;
  verifierCommand: string;
  rcGateSmokeCommand: string;
  requiresHumanReview: true;
}

interface WindowsReleaseGateHandoff {
  schemaVersion: 1;
  generatedAt: string;
  evidenceKind: "windows-release-gate-handoff";
  status: "handoff_ready";
  rcCandidateReady: false;
  productionReady: false;
  unsignedDraft: true;
  handoffDirectory: "lumatrace-windows-release-gate-handoff";
  blockers: string[];
  gateActions: ReleaseGateAction[];
  files: ReleaseGateHandoffFile[];
  excludedFiles: string[];
  instructions: string[];
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
const handoffDir = resolve(releaseDir, "lumatrace-windows-release-gate-handoff");
const handoffManifestPath = resolve(releaseDir, "lumatrace-windows-release-gate-handoff-manifest.json");

const gateActions: ReleaseGateAction[] = [
  {
    gate: "manual_gui_qa",
    blockerCode: "MANUAL_GUI_QA",
    templateFile: "lumatrace-windows-manual-gui-qa-template.json",
    resultFile: "lumatrace-windows-manual-gui-qa-result.json",
    verifierCommand: "pnpm verify:windows-manual-gui-qa-result path/to/lumatrace-windows-manual-gui-qa-result.json",
    rcGateSmokeCommand: "pnpm smoke:windows-packaging-rc-gate-manual-result",
    requiresHumanReview: true
  },
  {
    gate: "sidecar_production_readiness",
    blockerCode: "SIDECAR_PRODUCTION_READINESS",
    templateFile: "lumatrace-windows-sidecar-production-readiness-template.json",
    resultFile: "lumatrace-windows-sidecar-production-readiness-result.json",
    verifierCommand:
      "pnpm verify:windows-sidecar-production-readiness-result path/to/lumatrace-windows-sidecar-production-readiness-result.json",
    rcGateSmokeCommand: "pnpm smoke:windows-packaging-rc-gate-sidecar-readiness-result",
    requiresHumanReview: true
  },
  {
    gate: "license_notice_review",
    blockerCode: "LICENSE_NOTICE_REVIEW",
    templateFile: "lumatrace-windows-license-review-template.json",
    resultFile: "lumatrace-windows-license-review-result.json",
    verifierCommand: "pnpm verify:windows-license-review-result path/to/lumatrace-windows-license-review-result.json",
    rcGateSmokeCommand: "pnpm smoke:windows-packaging-rc-gate-license-review-result",
    requiresHumanReview: true
  },
  {
    gate: "code_signing",
    blockerCode: "CODE_SIGNING",
    templateFile: "lumatrace-windows-code-signing-readiness-template.json",
    resultFile: "lumatrace-windows-code-signing-readiness-result.json",
    verifierCommand:
      "pnpm verify:windows-code-signing-readiness-result path/to/lumatrace-windows-code-signing-readiness-result.json",
    rcGateSmokeCommand: "pnpm smoke:windows-packaging-rc-gate-code-signing-result",
    requiresHumanReview: true
  },
  {
    gate: "updater_policy",
    blockerCode: "UPDATER_POLICY",
    templateFile: "lumatrace-windows-updater-policy-readiness-template.json",
    resultFile: "lumatrace-windows-updater-policy-readiness-result.json",
    verifierCommand:
      "pnpm verify:windows-updater-policy-readiness-result path/to/lumatrace-windows-updater-policy-readiness-result.json",
    rcGateSmokeCommand: "pnpm smoke:windows-packaging-rc-gate-updater-policy-result",
    requiresHumanReview: true
  },
  {
    gate: "release_approval",
    blockerCode: "RELEASE_APPROVAL",
    templateFile: "lumatrace-windows-release-approval-readiness-template.json",
    resultFile: "lumatrace-windows-release-approval-readiness-result.json",
    verifierCommand:
      "pnpm verify:windows-release-approval-readiness-result path/to/lumatrace-windows-release-approval-readiness-result.json",
    rcGateSmokeCommand: "pnpm smoke:windows-packaging-rc-gate-release-approval-result",
    requiresHumanReview: true
  }
];

const sourceFiles = [
  {
    role: "release gate instructions",
    path: resolve(root, "docs/windows-release-gate-handoff.md")
  },
  {
    role: "Windows packaging RC gate",
    path: resolve(releaseDir, "lumatrace-windows-packaging-rc-gate.json")
  },
  {
    role: "Windows packaging release readiness",
    path: resolve(releaseDir, "lumatrace-windows-packaging-release-readiness.json")
  },
  {
    role: "Windows release policy template",
    path: resolve(releaseDir, "lumatrace-windows-release-policy-template.json")
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
  const gateList = gateActions
    .map(
      (action) =>
        `- ${action.blockerCode}: fill \`${action.resultFile}\`, then run \`${action.verifierCommand}\`.`
    )
    .join("\n");
  const readme = `# LumaTrace Windows Release Gate Handoff

This directory is a sanitized handoff packet for resolving the Windows RC blockers.

It is not release approval, it does not sign binaries, and it must keep productionReady false.

## Current Status

- handoff status: handoff_ready
- rcCandidateReady: false
- productionReady: false
- unsigned draft: true
- current blockers: ${blockers.length === 0 ? "none recorded" : blockers.join(", ")}

## Gate Actions

${gateList}

## Rules

- Result files must be separate from this handoff packet.
- Run the matching verifier for each result before refreshing the RC gate.
- Do not copy reviewer notes, evidence notes, secrets, raw logs, raw stdout/stderr, command lines, raw license text, raw CSV, logcat, bugreport, Android full serials, stack traces, or full local user paths into aggregate evidence.
- Passing one gate removes only that gate's blocker.
- productionReady remains false until all real release gates have approved evidence and production release approval is explicitly granted.
`;
  const readmePath = resolve(handoffDir, "README.md");
  writeFileSync(readmePath, readme, "utf8");
  return readmePath;
}

for (const file of sourceFiles) {
  if (!existsSync(file.path)) {
    fail(`Required release gate handoff source is missing: ${file.role} (${file.path})`);
  }
  if (!hasCleanText(readFileSync(file.path, "utf8"))) {
    fail(`Required release gate handoff source is not sanitized: ${file.role}`);
  }
}

rmSync(handoffDir, { recursive: true, force: true });
mkdirSync(handoffDir, { recursive: true });

const blockers = readRcBlockers();
const copiedFiles: ReleaseGateHandoffFile[] = [];

for (const file of sourceFiles) {
  const fileName = basename(file.path);
  const destination = resolve(handoffDir, fileName);
  copyFileSync(file.path, destination);
  const isJson = fileName.endsWith(".json");
  const document = isJson ? readJson(destination) : undefined;
  copiedFiles.push({
    role: file.role,
    fileName,
    source: file.role,
    sha256: sha256(destination),
    sizeBytes: statSync(destination).size,
    ...(document !== undefined && field(document, "status") !== undefined ? { status: field(document, "status") } : {})
  });
}

const readmePath = writeReadme(blockers);
copiedFiles.unshift({
  role: "release gate handoff instructions",
  fileName: "README.md",
  source: "generated",
  sha256: sha256(readmePath),
  sizeBytes: statSync(readmePath).size
});

const manifest: WindowsReleaseGateHandoff = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  evidenceKind: "windows-release-gate-handoff",
  status: "handoff_ready",
  rcCandidateReady: false,
  productionReady: false,
  unsignedDraft: true,
  handoffDirectory: "lumatrace-windows-release-gate-handoff",
  blockers,
  gateActions,
  files: copiedFiles,
  excludedFiles: [
    "release gate result files",
    "reviewer notes",
    "evidence notes",
    "raw logs",
    "raw stdout/stderr",
    "command lines",
    "raw license text",
    "raw PresentMon CSV",
    "logcat",
    "bugreport",
    "Android full serial",
    "auth token"
  ],
  instructions: [
    "Use this handoff to route each Windows RC blocker to the correct human-reviewed result file.",
    "Do not treat this handoff as release approval.",
    "Run each result verifier before refreshing the RC gate.",
    "productionReady must remain false until every real release gate is approved."
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
    "This is an unsigned Windows release gate handoff, not a production release.",
    "The handoff does not contain completed result files or reviewer notes.",
    "The handoff does not configure signing, updater behavior, license approval, sidecar production readiness, manual QA, or release approval.",
    "productionReady remains false."
  ]
};

mkdirSync(dirname(handoffManifestPath), { recursive: true });
writeFileSync(handoffManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
writeFileSync(resolve(handoffDir, "lumatrace-windows-release-gate-handoff-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

if (!hasCleanText(JSON.stringify(manifest))) {
  fail("Generated release gate handoff manifest is not sanitized");
}

console.log(`Windows release gate handoff written to ${handoffDir}`);
console.log(`Windows release gate handoff manifest written to ${handoffManifestPath}`);
console.log(`blockers=${blockers.join(",")}`);
