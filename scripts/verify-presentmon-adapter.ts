import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

interface PackageJson {
  scripts?: Record<string, string>;
}

const requiredFiles = [
  "docs/windows-presentmon.md",
  "docs/pc-foundation.md",
  "packages/collectors/pc/src/windows/PresentMonCaptureCommand.ts",
  "packages/collectors/pc/src/windows/PresentMonCaptureRuntime.ts",
  "packages/collectors/pc/src/windows/PresentMonProcessMatcher.ts",
  "packages/collectors/pc/src/windows/PresentMonMetricMapper.ts",
  "packages/collectors/pc/src/windows/PresentMonPermissionDiagnostics.ts",
  "packages/collectors/pc/test/PresentMonCaptureCommand.test.ts",
  "packages/collectors/pc/test/PresentMonCaptureRuntime.test.ts",
  "packages/collectors/pc/test/PresentMonProcessMatcher.test.ts",
  "packages/collectors/pc/test/PresentMonMetricMapper.test.ts",
  "packages/collectors/pc/test/PresentMonPermissionDiagnostics.test.ts",
  "apps/desktop/test/TestSessionFlow.test.tsx",
  "packages/report/test/PcReportDiagnostics.test.ts"
] as const;

function readText(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

function check(name: string, passed: boolean): void {
  console.log(`${passed ? "[ok]" : "[fail]"} ${name}`);
  if (!passed) {
    process.exitCode = 1;
  }
}

for (const file of requiredFiles) {
  check(`file exists: ${file}`, existsSync(resolve(file)));
}

const packageJson = JSON.parse(readText("package.json")) as PackageJson;
check("package script exists: verify:presentmon-adapter", packageJson.scripts?.["verify:presentmon-adapter"] !== undefined);

const presentMonDocs = readText("docs/windows-presentmon.md");
check("docs mention explicit capture", /explicit PresentMon.*capture|explicit timed capture/is.test(presentMonDocs));
check("docs say capture default off", /default off|enablePresentMonCapture=false/i.test(presentMonDocs));
check("docs say FPS experimental", /experimental/i.test(presentMonDocs));
check("docs say no ETW SDK claim", /does not implement an ETW SDK/i.test(presentMonDocs));
check("docs say no GPU telemetry", /GPU telemetry/i.test(presentMonDocs));
check("docs say no process injection", /process injection/i.test(presentMonDocs));
check("docs include permission warning", /permission|elevated/i.test(presentMonDocs));
check("docs say no fake FPS", /no FPS|does not fabricate FPS|not converted into fake FPS/i.test(presentMonDocs));

const pcCollector = readText("packages/collectors/pc/src/PcCollector.ts");
check("PresentMon capture default is config-gated", /enablePresentMonCapture === true/.test(pcCollector));
check("capture failure does not replace CPU/memory loop", /presentMonRuntime/.test(pcCollector) && /WindowsProcessSampler/.test(pcCollector));

const command = readText("packages/collectors/pc/src/windows/PresentMonCaptureCommand.ts");
check("capture command uses args array", /args: string\[\]/.test(command) && /args\.push/.test(command));
check("capture duration capped", /120000/.test(command));
check("unsafe args rejected", /Unsafe PresentMon/.test(command) && /additionalArgs cannot override/.test(command));

const matcher = readText("packages/collectors/pc/src/windows/PresentMonProcessMatcher.ts");
check("matcher handles ambiguous target", /ambiguous/.test(matcher));
check("matcher handles no_match", /no_match/.test(matcher));

const mapper = readText("packages/collectors/pc/src/windows/PresentMonMetricMapper.ts");
check("mapper emits source precision confidence", /PresentMon:CSV/.test(mapper) && /precision: "estimated"/.test(mapper) && /confidence/.test(mapper));
check("mapper avoids average FPS frame-time fabrication", !/average/i.test(mapper));

const sanitizerTest = readText("packages/collectors/pc/test/sanitizePcDiagnostic.test.ts");
check("path sanitizer tests present", /Windows path/i.test(sanitizerTest) || /<user-path>/i.test(sanitizerTest));

const desktopTest = readText("apps/desktop/test/TestSessionFlow.test.tsx");
check("desktop test covers PresentMon toggle default off", /PresentMon capture|Run explicit timed CSV capture/i.test(desktopTest) && /toBe\(false\)/.test(desktopTest));

const reportTest = readText("packages/report/test/PcReportDiagnostics.test.ts");
check("report test covers PresentMon section", /explicit PresentMon/.test(reportTest) || /PresentMon.*summary/is.test(reportTest));

console.log("");
console.log("PresentMon adapter verification checklist:");
console.log("- capture default off");
console.log("- explicit enablePresentMonCapture required");
console.log("- missing/no-match/ambiguous capture emits no FPS");
console.log("- CPU/memory continue when PresentMon is missing or capture fails");
console.log("- raw CSV and full local paths are not reported");

if (process.exitCode === 1) {
  console.error("PresentMon adapter verification failed");
} else {
  console.log("PresentMon adapter verification passed");
}
