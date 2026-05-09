import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

interface PackageJson {
  scripts?: Record<string, string>;
}

const root = process.cwd();

function readText(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

function check(name: string, passed: boolean): void {
  console.log(`${passed ? "[ok]" : "[fail]"} ${name}`);
  if (!passed) {
    process.exitCode = 1;
  }
}

const requiredFiles = [
  "scripts/publish-windows-preview-release.ts",
  "scripts/verify-windows-preview-release.ts",
  "docs/windows-preview-release.md"
];

for (const file of requiredFiles) {
  check(`file exists: ${file}`, existsSync(resolve(root, file)));
}

const packageJson = JSON.parse(readText("package.json")) as PackageJson;
check("package script exists: release:windows-preview", packageJson.scripts?.["release:windows-preview"] !== undefined);
check("package script exists: verify:windows-preview-release", packageJson.scripts?.["verify:windows-preview-release"] !== undefined);

const script = readText("scripts/publish-windows-preview-release.ts");
check("release script requires a tag", /--tag/.test(script) && /semver release tag/.test(script));
check("release script supports dry run", /--dry-run/.test(script));
check("release script requires explicit publish", /--publish/.test(script));
check("release script uses gh release create", /gh".*\[\s*"release"/su.test(script) && /"create"/.test(script));
check("release script creates a prerelease", /--prerelease/.test(script));
check("release script stages installer assets", /windows-x64-setup\.exe/.test(script));
check("release script preserves productionReady=false", /productionReady:\s*false/.test(script));
check("release script does not set productionReady true", !/productionReady:\s*true/.test(script));
check("release script runs sidecar health smoke", /smoke-windows-installed-sidecar-health/.test(script));

const docs = readText("docs/windows-preview-release.md");
check("docs mention one-click preview release", /one-click Windows preview release/i.test(docs));
check("docs mention unsigned prerelease", /unsigned/i.test(docs) && /prerelease/i.test(docs));
check("docs mention GitHub release", /GitHub release/i.test(docs));
check("docs mention productionReady false", /productionReady=false|productionReady` remains `false`/i.test(docs));
check("docs mention code signing incomplete", /code signing.*not complete|no code signing/i.test(docs));
check("docs mention updater incomplete", /updater.*not|no updater/i.test(docs));
check("docs mention Chinese release notes", /Chinese|中文/i.test(docs));

const tauriConfig = readText("apps/desktop/src-tauri/tauri.conf.json");
check("Tauri app version is no longer 0.0.0", !/"version"\s*:\s*"0\.0\.0"/.test(tauriConfig));

if (process.exitCode === 1) {
  console.error("Windows preview release verification failed");
  process.exit(1);
}

console.log("Windows preview release verification passed");
