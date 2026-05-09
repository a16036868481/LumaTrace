import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

interface HandoffFile {
  role?: unknown;
  fileName?: unknown;
  sha256?: unknown;
  sizeBytes?: unknown;
}

interface WindowsManualGuiQaHandoff {
  evidenceKind?: unknown;
  status?: unknown;
  productionReady?: unknown;
  unsignedDraft?: unknown;
  manualGuiQaStatus?: unknown;
  handoffDirectory?: unknown;
  files?: HandoffFile[];
  excludedFiles?: unknown[];
  securityAssertions?: {
    tokenRedacted?: unknown;
    fullLocalPathsRedacted?: unknown;
    rawLogsExcluded?: unknown;
    rawStdoutStderrExcluded?: unknown;
    manualReviewerNotesExcluded?: unknown;
    publicSidecarListenersAllowed?: unknown;
  };
}

const root = process.cwd();
const releaseDir = resolve(root, "apps/desktop/src-tauri/target/release");
const handoffDir = resolve(releaseDir, "lumatrace-windows-manual-gui-qa-handoff");
const manifestPath = resolve(releaseDir, "lumatrace-windows-manual-gui-qa-handoff-manifest.json");

const requiredFiles = [
  "README.md",
  "windows-packaging-manual-gui-checklist.md",
  "lumatrace-windows-manual-gui-qa-template.json",
  "lumatrace-windows-packaging-qa-evidence.json",
  "lumatrace-windows-packaging-rc-gate.json",
  "lumatrace-windows-release-policy-template.json",
  "sidecar-manifest.json",
  "packaging-notices.json",
  "THIRD-PARTY-NOTICES.md"
] as const;

function check(name: string, passed: boolean): void {
  console.log(`${passed ? "[ok]" : "[fail]"} ${name}`);
  if (!passed) {
    process.exitCode = 1;
  }
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

check("manual GUI QA handoff manifest exists", existsSync(manifestPath));
check("manual GUI QA handoff directory exists", existsSync(handoffDir));
if (!existsSync(manifestPath) || !existsSync(handoffDir)) {
  process.exit(1);
}

const manifestText = readFileSync(manifestPath, "utf8");
const manifest = JSON.parse(manifestText) as WindowsManualGuiQaHandoff;
const files = manifest.files ?? [];
const fileByName = new Map(
  files
    .filter((file) => typeof file.fileName === "string")
    .map((file) => [file.fileName as string, file])
);

check("handoff manifest is sanitized", hasCleanText(manifestText));
check("evidence kind is windows-manual-gui-qa-handoff", manifest.evidenceKind === "windows-manual-gui-qa-handoff");
check("handoff status is ready", manifest.status === "handoff_ready");
check("productionReady remains false", manifest.productionReady === false);
check("unsigned draft remains explicit", manifest.unsignedDraft === true);
check("handoff directory is relative", manifest.handoffDirectory === "lumatrace-windows-manual-gui-qa-handoff");
check("manual GUI QA status is explicit", typeof manifest.manualGuiQaStatus === "string");
check("manual GUI QA is not silently passed", manifest.manualGuiQaStatus !== "result_passed");
check("token redaction asserted", manifest.securityAssertions?.tokenRedacted === true);
check("path redaction asserted", manifest.securityAssertions?.fullLocalPathsRedacted === true);
check("raw logs excluded", manifest.securityAssertions?.rawLogsExcluded === true);
check("raw stdout/stderr excluded", manifest.securityAssertions?.rawStdoutStderrExcluded === true);
check("manual reviewer notes excluded", manifest.securityAssertions?.manualReviewerNotesExcluded === true);
check("public sidecar listeners disallowed", manifest.securityAssertions?.publicSidecarListenersAllowed === false);
check(
  "completed manual result is excluded",
  (manifest.excludedFiles ?? []).some((value) => value === "lumatrace-windows-manual-gui-qa-result.json")
);

for (const fileName of requiredFiles) {
  const path = resolve(handoffDir, fileName);
  const entry = fileByName.get(fileName);
  check(`handoff file exists: ${fileName}`, existsSync(path));
  check(`handoff manifest includes: ${fileName}`, entry !== undefined);
  if (existsSync(path)) {
    const text = readFileSync(path, "utf8");
    check(`handoff file is sanitized: ${fileName}`, hasCleanText(text));
    if (entry !== undefined) {
      check(`handoff hash matches: ${fileName}`, entry.sha256 === sha256(path));
      check(`handoff size matches: ${fileName}`, entry.sizeBytes === statSync(path).size);
    }
  }
}

const readme = readFileSync(resolve(handoffDir, "README.md"), "utf8");
check("README says not production-ready", /productionReady:\s*false/i.test(readme));
check("README says result must be separate", /separate result JSON/i.test(readme));
check("README says no tokens/raw logs", /excludes auth tokens/i.test(readme) && /raw logs/i.test(readme));

if (process.exitCode === 1) {
  console.error("Windows manual GUI QA handoff verification failed");
  process.exit(1);
}

console.log("Windows manual GUI QA handoff verification passed");
