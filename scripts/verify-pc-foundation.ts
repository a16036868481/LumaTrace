import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

interface PackageJson {
  scripts?: Record<string, string>;
}

const requiredFiles = [
  "docs/pc-foundation.md",
  "docs/windows-setup.md",
  "docs/windows-presentmon.md",
  "packages/collectors/pc/src/PcCollector.ts",
  "packages/collectors/pc/src/availability/pcCapabilities.ts",
  "packages/collectors/pc/src/windows/PresentMonTool.ts",
  "packages/collectors/pc/src/windows/PresentMonCsvParser.ts",
  "packages/collectors/pc/src/diagnostics/sanitizePcDiagnostic.ts",
  "packages/collectors/pc/test/PresentMonCsvParser.test.ts",
  "packages/collectors/pc/test/sanitizePcDiagnostic.test.ts"
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
check("package script exists: test:pc-collector", packageJson.scripts?.["test:pc-collector"] !== undefined);
check("package script exists: verify:pc-foundation", packageJson.scripts?.["verify:pc-foundation"] !== undefined);

const pcFoundation = readText("docs/pc-foundation.md");
check("PC docs mention Windows CPU/memory", /Windows.*CPU.*memory/i.test(pcFoundation));
check("PC docs say no process injection", /does not inject/i.test(pcFoundation));
check("PC docs say no fake FPS", /fake FPS/i.test(pcFoundation));
check("PC docs mention PID reuse", /PID.*reused/i.test(pcFoundation));

const windowsSetup = readText("docs/windows-setup.md");
check("Windows setup mentions no admin bypass", /No administrator bypass/i.test(windowsSetup));
check("Windows setup mentions first CPU baseline", /first CPU sample/i.test(windowsSetup));

const presentMonDocs = readText("docs/windows-presentmon.md");
check("PresentMon docs say explicit capture is default off", /explicit/i.test(presentMonDocs) && /default off/i.test(presentMonDocs));
check("PresentMon docs say no ETW SDK consumer", /does not implement an ETW SDK/i.test(presentMonDocs));
check("PresentMon docs say no fabricated FPS", /does not fabricate FPS/i.test(presentMonDocs));

const capabilities = readText("packages/collectors/pc/src/availability/pcCapabilities.ts");
check("PC capabilities include process list", capabilities.includes("pc.process_list"));
check("PC FPS remains requires_tool/experimental", capabilities.includes("requires_tool") && capabilities.includes("experimental"));
check("PresentMon missing is handled", capabilities.includes("Install PresentMon"));

const sanitizerTest = readText("packages/collectors/pc/test/sanitizePcDiagnostic.test.ts");
check("path sanitizer tests exist", /Windows path/i.test(sanitizerTest) || /<user-path>/i.test(sanitizerTest));

const limitations = readText("docs/platform-limitations.md");
check("platform limitations mention PC Foundation", /PC Foundation/i.test(limitations));
check("platform limitations mention PresentMon", /PresentMon/i.test(limitations));

console.log("");
console.log("PC Foundation checklist:");
console.log("- pnpm test:pc-collector");
console.log("- pnpm test");
console.log("- pnpm typecheck");
console.log("- pnpm lint");
console.log("- pnpm build:desktop");
console.log("- PresentMon missing does not block CPU/memory");
console.log("- FPS/frame_time remain requires_tool or experimental");
console.log("- missing metrics remain N/A");

if (process.exitCode === 1) {
  console.error("PC Foundation verification failed");
} else {
  console.log("PC Foundation verification passed");
}
