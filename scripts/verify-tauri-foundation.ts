import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

interface PackageJson {
  scripts?: Record<string, string>;
}

const requiredFiles = [
  "apps/desktop/src-tauri/Cargo.toml",
  "apps/desktop/src-tauri/tauri.conf.json",
  "apps/desktop/src-tauri/capabilities/default.json",
  "apps/desktop/src-tauri/src/main.rs",
  "apps/desktop/src-tauri/src/sidecar.rs",
  "apps/desktop/src-tauri/src/auth.rs",
  "apps/desktop/src-tauri/src/paths.rs",
  "apps/local-server/src/middleware/localAuthMiddleware.ts",
  "apps/local-server/src/config/packagedEnv.ts",
  "apps/local-server/src/routes/packaged.ts",
  "apps/desktop/src/tauri/tauriClient.ts",
  "apps/desktop/src/tauri/localAuth.ts",
  "docs/tauri-packaging.md",
  "docs/sidecar-security.md",
  "docs/local-auth-token.md",
  "docs/packaging-troubleshooting.md"
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
check("package script exists: build:sidecar", packageJson.scripts?.["build:sidecar"] !== undefined);
check("package script exists: smoke:tauri-foundation", packageJson.scripts?.["smoke:tauri-foundation"] !== undefined);
check("package script exists: verify:tauri-foundation", packageJson.scripts?.["verify:tauri-foundation"] !== undefined);

const tauriConfig = readText("apps/desktop/src-tauri/tauri.conf.json");
check("externalBin configured", /externalBin/.test(tauriConfig) && /lumatrace-local-server/.test(tauriConfig));

const capabilities = readText("apps/desktop/src-tauri/capabilities/default.json");
check("capabilities do not allow arbitrary shell", !/shell:allow-execute|shell:allow-spawn|shell:default/.test(capabilities));
check("capabilities mention minimal permissions", /Minimal LumaTrace/.test(capabilities));

const authMiddleware = readText("apps/local-server/src/middleware/localAuthMiddleware.ts");
check("packaged auth middleware checks bearer", /assertLocalAuth/.test(authMiddleware));

const packagedEnv = readText("apps/local-server/src/config/packagedEnv.ts");
check("packaged mode rejects non-localhost", /127\.0\.0\.1/.test(packagedEnv) && /Packaged mode must listen/.test(packagedEnv));
check("packaged mode requires token", /requires a local auth token/.test(packagedEnv));

const desktopAuth = readText("apps/desktop/src/tauri/localAuth.ts");
check("token not stored in localStorage", !/localStorage/.test(desktopAuth));

const docs = [
  readText("docs/tauri-packaging.md"),
  readText("docs/sidecar-security.md"),
  readText("docs/local-auth-token.md"),
  readText("docs/packaging-troubleshooting.md")
].join("\n");
check("docs mention 127.0.0.1 only", /127\.0\.0\.1/.test(docs));
check("docs mention bearer token", /Bearer token|auth token/i.test(docs));
check("docs say token not in VITE", /VITE_/.test(docs) && /not/.test(docs));
check("docs mention AppLocalData and AppLog", /AppLocalData/.test(docs) && /AppLog/.test(docs));
check("docs say no updater/signing claim", /not.*updater|no updater/i.test(docs) && /not.*code signing|no code signing/i.test(docs));
check("docs mention production sidecar TODO", /production.*TODO|self-contained sidecar.*TODO/i.test(docs));

console.log("");
console.log("Tauri foundation verification checklist:");
console.log("- src-tauri scaffold exists");
console.log("- sidecar security docs exist");
console.log("- packaged local-server requires token and localhost");
console.log("- token is memory-only in desktop frontend");
console.log("- no arbitrary shell permission is granted");

if (process.exitCode === 1) {
  console.error("Tauri foundation verification failed");
} else {
  console.log("Tauri foundation verification passed");
}
