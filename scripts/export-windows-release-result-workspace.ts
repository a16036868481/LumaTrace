import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

interface GateAction {
  gate: string;
  blockerCode: string;
  templateFile: string;
  resultFile: string;
  verifierCommand: string;
  rcGateSmokeCommand: string;
  requiresHumanReview: true;
}

interface WorkspaceFile {
  role: string;
  relativePath: string;
  fileName: string;
  sha256: string;
  sizeBytes: number;
}

interface WorkspaceDraft {
  gate: string;
  blockerCode: string;
  draftFile: string;
  expectedResultFile: string;
  sourceTemplateFile: string;
  verifierCommand: string;
  rcGateSmokeCommand: string;
  canRemoveBlocker: false;
}

interface WindowsReleaseResultWorkspace {
  schemaVersion: 1;
  generatedAt: string;
  evidenceKind: "windows-release-result-workspace";
  status: "workspace_ready";
  rcCandidateReady: false;
  productionReady: false;
  unsignedDraft: true;
  workspaceDirectory: "lumatrace-windows-release-result-workspace";
  currentIntake: {
    exists: boolean;
    status: string;
    validResults: number;
    invalidResults: number;
    missingResults: number;
  };
  gateActions: GateAction[];
  drafts: WorkspaceDraft[];
  files: WorkspaceFile[];
  instructions: string[];
  excludedFiles: string[];
  securityAssertions: {
    tokenRedacted: true;
    fullLocalPathsRedacted: true;
    rawLogsExcluded: true;
    rawStdoutStderrExcluded: true;
    rawLicenseTextExcluded: true;
    reviewerNotesExcluded: true;
    evidenceNotesExcluded: true;
    resultFilesExcludedFromReleaseRoot: true;
    publicSidecarListenersAllowed: false;
  };
  limitations: string[];
}

const root = process.cwd();
const releaseDir = resolve(root, "apps/desktop/src-tauri/target/release");
const handoffManifestPath = resolve(releaseDir, "lumatrace-windows-release-gate-handoff-manifest.json");
const intakePath = resolve(releaseDir, "lumatrace-windows-release-gate-results-intake.json");
const workspaceDir = resolve(releaseDir, "lumatrace-windows-release-result-workspace");
const templatesDir = resolve(workspaceDir, "templates");
const draftsDir = resolve(workspaceDir, "drafts");
const resultsDir = resolve(workspaceDir, "results");
const workspaceManifestPath = resolve(releaseDir, "lumatrace-windows-release-result-workspace-manifest.json");

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
    !/"(?:authToken|token|secret|password)"\s*:\s*"[^"]{8,}"/iu.test(normalized) &&
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

function asObject(value: JsonValue | undefined): Record<string, JsonValue> | undefined {
  return value !== undefined && value !== null && !Array.isArray(value) && typeof value === "object" ? value : undefined;
}

function readGateActions(): GateAction[] {
  if (!existsSync(handoffManifestPath)) {
    fail("Release gate handoff manifest is missing. Run pnpm verify:windows-release-gate-handoff first.");
  }
  const handoff = readJson(handoffManifestPath);
  if (handoff.evidenceKind !== "windows-release-gate-handoff" || handoff.productionReady !== false) {
    fail("Release gate handoff manifest is not a safe draft handoff.");
  }
  if (!Array.isArray(handoff.gateActions)) {
    fail("Release gate handoff manifest does not include gate actions.");
  }
  return handoff.gateActions
    .map((entry) => {
      const action = asObject(entry);
      if (
        action === undefined ||
        typeof action.gate !== "string" ||
        typeof action.blockerCode !== "string" ||
        typeof action.templateFile !== "string" ||
        typeof action.resultFile !== "string" ||
        typeof action.verifierCommand !== "string" ||
        typeof action.rcGateSmokeCommand !== "string" ||
        action.requiresHumanReview !== true
      ) {
        return undefined;
      }
      return {
        gate: action.gate,
        blockerCode: action.blockerCode,
        templateFile: action.templateFile,
        resultFile: action.resultFile,
        verifierCommand: action.verifierCommand,
        rcGateSmokeCommand: action.rcGateSmokeCommand,
        requiresHumanReview: true
      } satisfies GateAction;
    })
    .filter((entry): entry is GateAction => entry !== undefined);
}

function summarizeCurrentIntake(): WindowsReleaseResultWorkspace["currentIntake"] {
  if (!existsSync(intakePath)) {
    return {
      exists: false,
      status: "missing",
      validResults: 0,
      invalidResults: 0,
      missingResults: 0
    };
  }
  const intake = readJson(intakePath);
  const results = Array.isArray(intake.results) ? intake.results.map((entry) => asObject(entry)).filter(Boolean) : [];
  return {
    exists: true,
    status: typeof intake.status === "string" ? intake.status : "unknown",
    validResults: results.filter((entry) => entry?.status === "valid_result").length,
    invalidResults: results.filter((entry) => entry?.status === "invalid_result").length,
    missingResults: results.filter((entry) => entry?.status === "missing_result").length
  };
}

function writeReadme(actions: GateAction[]): string {
  const rows = actions
    .map(
      (action) =>
        `| ${action.blockerCode} | ${action.templateFile} | drafts/${action.resultFile}.draft.json | ${action.verifierCommand} |`
    )
    .join("\n");
  const readme = `# LumaTrace Windows Release Result Workspace

This workspace helps reviewers prepare release gate result files. It is not release approval and it cannot remove blockers by itself.

## How To Use

1. Review the matching template in \`templates/\`.
2. Use the matching draft in \`drafts/\` as a local note-taking starting point.
3. Create the final result file with the exact file name expected by the verifier.
4. Run the dedicated verifier for that result.
5. After verified result files are placed in the release directory, run \`pnpm verify:windows-release-gate-results\` and then refresh the RC gate.

## Gate Map

| Blocker | Template | Draft | Verifier |
| --- | --- | --- | --- |
${rows}

## Safety Rules

- Drafts use \`evidenceKind: "windows-release-result-draft"\` and are intentionally not valid release results.
- Drafts must not be placed in the release root as real result files.
- Do not include tokens, full local paths, raw logs, raw stdout/stderr, command lines, raw license text, raw CSV, logcat, bugreport data, Android full serials, stack traces, reviewer notes, or evidence notes in aggregate evidence.
- Passing one gate removes only that gate's blocker after the RC gate is refreshed.
- \`productionReady\` remains false until all real release gates are reviewed and production release approval is explicit.
`;
  const readmePath = resolve(workspaceDir, "README.md");
  writeFileSync(readmePath, readme, "utf8");
  return readmePath;
}

function writeGateMap(actions: GateAction[]): string {
  const path = resolve(workspaceDir, "gate-result-map.json");
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        evidenceKind: "windows-release-result-workspace-map",
        productionReady: false,
        rcCandidateReady: false,
        gateActions: actions
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  return path;
}

function writeResultsReadme(): string {
  const readme = `# Release Result Drop Directory

Place final, verifier-ready release result files in this directory when using the import helper.

Expected file names are the exact names listed in \`../gate-result-map.json\`. The importer ignores
unknown file names, runs the dedicated verifier for each known result, copies only valid result files
to the release directory, refreshes the release gate intake, and writes an import manifest.

Run:

\`\`\`bash
pnpm import:windows-release-gate-results -- --results-dir apps/desktop/src-tauri/target/release/lumatrace-windows-release-result-workspace/results
pnpm verify:windows-release-gate-results-import
\`\`\`

Do not place raw logs, tokens, full local paths, command lines, raw license text, raw CSV, logcat,
bugreport data, Android full serials, stack traces, reviewer notes, or evidence notes here.
\`productionReady\` remains false.
`;
  const readmePath = resolve(resultsDir, "README.md");
  writeFileSync(readmePath, readme, "utf8");
  return readmePath;
}

function writeDraft(action: GateAction): string {
  const path = resolve(draftsDir, `${action.resultFile}.draft.json`);
  const draft = {
    schemaVersion: 1,
    evidenceKind: "windows-release-result-draft",
    status: "draft_pending",
    gate: action.gate,
    blockerCode: action.blockerCode,
    expectedResultFile: action.resultFile,
    sourceTemplateFile: action.templateFile,
    verifierCommand: action.verifierCommand,
    rcGateSmokeCommand: action.rcGateSmokeCommand,
    canRemoveBlocker: false,
    productionReady: false,
    rcCandidateReady: false,
    unsignedDraft: true,
    reviewer: {
      name: null,
      completedAt: null,
      decision: "pending"
    },
    fillInstructions: [
      "This draft is not a valid result file.",
      "Use the source template and the dedicated verifier to produce the final result schema.",
      "Keep reviewer notes and evidence notes out of aggregate release manifests.",
      "Keep tokens, full paths, raw logs, command lines, stack traces, and secrets out of the result."
    ],
    securityAssertions: {
      tokenRedacted: true,
      fullLocalPathsRedacted: true,
      rawLogsExcluded: true,
      rawStdoutStderrExcluded: true,
      reviewerNotesExcludedFromAggregate: true,
      evidenceNotesExcludedFromAggregate: true,
      publicSidecarListenersAllowed: false
    },
    limitations: [
      "Draft only; cannot remove a release blocker.",
      "The final result must pass its dedicated verifier.",
      "productionReady remains false."
    ]
  };
  writeFileSync(path, `${JSON.stringify(draft, null, 2)}\n`, "utf8");
  return path;
}

function addFile(files: WorkspaceFile[], role: string, path: string, relativePath: string): void {
  files.push({
    role,
    relativePath,
    fileName: basename(path),
    sha256: sha256(path),
    sizeBytes: statSync(path).size
  });
}

const gateActions = readGateActions();
if (gateActions.length === 0) {
  fail("Release gate handoff has no gate actions.");
}

rmSync(workspaceDir, { recursive: true, force: true });
mkdirSync(templatesDir, { recursive: true });
mkdirSync(draftsDir, { recursive: true });
mkdirSync(resultsDir, { recursive: true });

const files: WorkspaceFile[] = [];
const drafts: WorkspaceDraft[] = [];
const readmePath = writeReadme(gateActions);
addFile(files, "workspace instructions", readmePath, "README.md");
const gateMapPath = writeGateMap(gateActions);
addFile(files, "gate result map", gateMapPath, "gate-result-map.json");
const resultsReadmePath = writeResultsReadme();
addFile(files, "release result import drop instructions", resultsReadmePath, "results/README.md");

for (const action of gateActions) {
  if (/[\\/]/u.test(action.templateFile) || /[\\/]/u.test(action.resultFile)) {
    fail(`Unsafe gate action file name for ${action.blockerCode}`);
  }
  const templatePath = resolve(releaseDir, action.templateFile);
  if (!existsSync(templatePath)) {
    fail(`Release gate template is missing: ${action.templateFile}`);
  }
  const templateText = readFileSync(templatePath, "utf8");
  if (!hasCleanText(templateText)) {
    fail(`Release gate template is not sanitized: ${action.templateFile}`);
  }
  const destination = resolve(templatesDir, action.templateFile);
  copyFileSync(templatePath, destination);
  addFile(files, `template for ${action.blockerCode}`, destination, `templates/${action.templateFile}`);

  const draftPath = writeDraft(action);
  addFile(files, `draft for ${action.blockerCode}`, draftPath, `drafts/${basename(draftPath)}`);
  drafts.push({
    gate: action.gate,
    blockerCode: action.blockerCode,
    draftFile: basename(draftPath),
    expectedResultFile: action.resultFile,
    sourceTemplateFile: action.templateFile,
    verifierCommand: action.verifierCommand,
    rcGateSmokeCommand: action.rcGateSmokeCommand,
    canRemoveBlocker: false
  });
}

const manifest: WindowsReleaseResultWorkspace = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  evidenceKind: "windows-release-result-workspace",
  status: "workspace_ready",
  rcCandidateReady: false,
  productionReady: false,
  unsignedDraft: true,
  workspaceDirectory: "lumatrace-windows-release-result-workspace",
  currentIntake: summarizeCurrentIntake(),
  gateActions,
  drafts,
  files,
  instructions: [
    "Use this workspace to prepare human-reviewed release result files.",
    "Draft files are intentionally not valid release results and cannot remove blockers.",
    "Run each dedicated verifier before refreshing release gate intake and RC gate manifests."
  ],
  excludedFiles: [
    "valid release result files",
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
  securityAssertions: {
    tokenRedacted: true,
    fullLocalPathsRedacted: true,
    rawLogsExcluded: true,
    rawStdoutStderrExcluded: true,
    rawLicenseTextExcluded: true,
    reviewerNotesExcluded: true,
    evidenceNotesExcluded: true,
    resultFilesExcludedFromReleaseRoot: true,
    publicSidecarListenersAllowed: false
  },
  limitations: [
    "This workspace is a reviewer aid only, not release approval.",
    "Draft files cannot remove RC blockers.",
    "The workspace does not sign artifacts, configure updater policy, approve licenses, approve sidecar production readiness, run manual GUI QA, or approve release.",
    "productionReady remains false."
  ]
};

mkdirSync(dirname(workspaceManifestPath), { recursive: true });
writeFileSync(workspaceManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
writeFileSync(resolve(workspaceDir, "lumatrace-windows-release-result-workspace-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

if (!hasCleanText(JSON.stringify(manifest))) {
  fail("Generated release result workspace manifest is not sanitized");
}
for (const file of files) {
  const path = resolve(workspaceDir, file.relativePath);
  if (!hasCleanText(readFileSync(path, "utf8"))) {
    fail(`Generated release result workspace file is not sanitized: ${file.relativePath}`);
  }
}

console.log(`Windows release result workspace written to ${workspaceDir}`);
console.log(`Windows release result workspace manifest written to ${workspaceManifestPath}`);
console.log(`drafts=${String(drafts.length)}`);
