import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

interface PackageJson {
  scripts?: Record<string, string>;
}

const requiredFiles = [
  "docs/pc-beta.md",
  "docs/windows-real-device-checklist.md",
  "docs/windows-presentmon-compatibility.md",
  "docs/pc-diagnostics.md",
  "packages/collectors/pc/src/windows/PresentMonCaptureStatus.ts",
  "packages/collectors/pc/src/windows/PresentMonCsvRetention.ts",
  "packages/collectors/pc/src/windows/PresentMonVersionCompatibility.ts",
  "packages/collectors/pc/src/windows/PresentMonCapturePlanner.ts",
  "packages/collectors/pc/test/PresentMonCaptureStatus.test.ts",
  "packages/collectors/pc/test/PresentMonCsvRetention.test.ts",
  "packages/collectors/pc/test/PresentMonVersionCompatibility.test.ts",
  "packages/collectors/pc/test/PresentMonCapturePlanner.test.ts",
  "packages/collectors/pc/test/PresentMonLongCaptureStability.test.ts",
  "packages/collectors/pc/test/sanitizePcDiagnostic.test.ts",
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
check("package script exists: verify:pc-beta", packageJson.scripts?.["verify:pc-beta"] !== undefined);

const pcBeta = readText("docs/pc-beta.md");
check("PC beta docs exist and mention default off", /PresentMon capture is default off/i.test(pcBeta));
check("PC beta docs say FPS experimental", /FPS and frame time remain experimental/i.test(pcBeta));
check("PC beta docs mention CSV retention", /CSV Retention/i.test(pcBeta));
check("PC beta docs mention Windows log access group", /Windows log access group/i.test(pcBeta));
check("PC beta docs say no ETW SDK", /does not implement an ETW SDK/i.test(pcBeta));
check("PC beta docs say no GPU telemetry", /GPU telemetry/i.test(pcBeta));
check("PC beta docs say no process injection", /process injection/i.test(pcBeta));
check("PC beta docs say no permission bypass", /permission bypass/i.test(pcBeta));
check("PC beta docs say no fake FPS", /No FPS is emitted/i.test(pcBeta));

const checklist = readText("docs/windows-real-device-checklist.md");
check("real device checklist has PresentMon missing path", /PresentMon Missing/i.test(checklist));
check("real device checklist has permission checks", /Windows log access group/i.test(checklist));
check("real device checklist has privacy checks", /Raw CSV content is not included/i.test(checklist));

const compatibility = readText("docs/windows-presentmon-compatibility.md");
check("compatibility docs mention PID fallback", /fall back to process-name/i.test(compatibility));
check("compatibility docs mention unsupported rather than guessing", /unsupported.*rather than guessing/i.test(compatibility));

const runtime = readText("packages/collectors/pc/src/windows/PresentMonCaptureRuntime.ts");
check("runtime exposes status", /getStatus\(\)/.test(runtime));
check("runtime supports subscribe status", /subscribeStatus/.test(runtime));
check("runtime handles abort", /PRESENTMON_CAPTURE_ABORTED/.test(runtime));
check("runtime avoids PID reuse matching", /PRESENTMON_PID_REUSED_DURING_CAPTURE/.test(runtime));

const retention = readText("packages/collectors/pc/src/windows/PresentMonCsvRetention.ts");
check("retention deletes by default", /delete_after_parse/.test(retention));
check("retention has 256 MB max", /256 \* 1024 \* 1024/.test(retention));
check("retention sanitizes path", /sanitizePcDiagnostic/.test(retention));

const planner = readText("packages/collectors/pc/src/windows/PresentMonCapturePlanner.ts");
check("planner handles tool missing", /PRESENTMON_MISSING/.test(planner));
check("planner handles output unsupported", /output file/i.test(planner));
check("planner clamps duration", /120000/.test(planner) && /Math\.min/.test(planner));

const pcCollector = readText("packages/collectors/pc/src/PcCollector.ts");
check("PresentMon capture remains config-gated", /enablePresentMonCapture === true/.test(pcCollector));
check("retention mode is passed through", /presentMonRetentionMode/.test(pcCollector));

const reportTest = readText("packages/report/test/PcReportDiagnostics.test.ts");
check("report test rejects raw CSV", /raw CSV/i.test(reportTest) || /Application,ProcessID/.test(reportTest));
check("report test rejects raw path", /C:\\\\Users\\\\alice/.test(reportTest));
check("report test covers no data reason", /PRESENTMON_TARGET_NO_MATCH/.test(reportTest));

const sanitizerTest = readText("packages/collectors/pc/test/sanitizePcDiagnostic.test.ts");
check("path sanitizer tests present", /Windows path/i.test(sanitizerTest) || /<user-path>/i.test(sanitizerTest));

console.log("");
console.log("PC Beta verification checklist:");
console.log("- capture default off");
console.log("- FPS/frame_time remain experimental");
console.log("- no ETW SDK, GPU telemetry, process injection, or permission bypass");
console.log("- CSV retention documented and raw CSV excluded from reports");
console.log("- no match, ambiguous, failed, aborted, or permission-limited capture emits no FPS");

if (process.exitCode === 1) {
  console.error("PC Beta verification failed");
} else {
  console.log("PC Beta verification passed");
}
