import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

interface PackageJson {
  scripts?: Record<string, string>;
}

function readText(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

function check(name: string, passed: boolean): void {
  console.log(`${passed ? "[ok]" : "[fail]"} ${name}`);
  if (!passed) {
    process.exitCode = 1;
  }
}

for (const file of [
  "apps/local-server/src/diagnostics/windowsToolBootstrap.ts",
  "apps/local-server/test/windowsToolBootstrap.test.ts",
  "scripts/bootstrap-windows-tools.ts",
  "scripts/verify-windows-tool-bootstrap.ts",
  "docs/windows-tool-bootstrap.md"
]) {
  check(`file exists: ${file}`, existsSync(resolve(file)));
}

const packageJson = JSON.parse(readText("package.json")) as PackageJson;
for (const scriptName of ["detect:windows-tools", "bootstrap:windows-tools", "verify:windows-tool-bootstrap"]) {
  check(`package script exists: ${scriptName}`, packageJson.scripts?.[scriptName] !== undefined);
}

const bootstrap = readText("apps/local-server/src/diagnostics/windowsToolBootstrap.ts");
check("ADB winget package id is fixed", /Google\.PlatformTools/.test(bootstrap));
check("PresentMon winget package id is fixed", /Intel\.PresentMon\.Console/.test(bootstrap));
check("production bundling remains disabled", /productionBundlingAllowed:\s*false/.test(bootstrap));
check("bootstrap exposes sanitized paths", /pathSanitized/.test(bootstrap));

const cli = readText("scripts/bootstrap-windows-tools.ts");
check("bootstrap CLI uses winget install with exact id", /winget/.test(cli) && /--id/.test(cli) && /-e/.test(cli));
check("bootstrap CLI can configure user environment", /SetEnvironmentVariable/.test(cli));
check("bootstrap CLI strips raw paths from JSON output", /publicStatus/.test(cli) && /rawPath/.test(cli));

const docs = [
  "docs/windows-tool-bootstrap.md",
  "docs/windows-installer-draft.md",
  "docs/packaging-hardening.md",
  "docs/packaging-troubleshooting.md",
  "docs/privacy-security.md"
]
  .map(readText)
  .join("\n");

check("docs mention installer or first-run bootstrap", /installer.*bootstrap|first-run.*bootstrap/i.test(docs));
check("docs mention no unclear-license bundling", /unclear-license|license review/i.test(docs));
check("docs mention adb package", /Google\.PlatformTools|Android SDK Platform-Tools/i.test(docs));
check("docs mention PresentMon package", /Intel\.PresentMon\.Console|PresentMon Console/i.test(docs));
check("docs say productionReady stays false", /productionReady=false|productionReady.*false/i.test(docs));
check("docs mention no token/log/report exposure", /token/i.test(docs) && /logs/i.test(docs) && /report/i.test(docs));

if (process.exitCode === 1) {
  console.error("Windows tool bootstrap verification failed");
} else {
  console.log("Windows tool bootstrap verification passed");
}

