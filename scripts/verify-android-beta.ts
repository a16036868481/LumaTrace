import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

interface PackageJson {
  scripts?: Record<string, string>;
}

const requiredFiles = [
  "docs/android-beta.md",
  "docs/android-diagnostics.md",
  "docs/android-real-device-checklist.md",
  "packages/collectors/android/src/diagnostics/AndroidDiagnosticsTimeline.ts",
  "packages/collectors/android/src/diagnostics/sanitizeAndroidDiagnostic.ts",
  "packages/collectors/android/src/cache/AndroidLauncherCache.ts",
  "packages/collectors/android/test/AndroidLongSessionStability.test.ts",
  "packages/report/test/AndroidReportDiagnostics.test.ts"
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
check("package script exists: test:android-collector", packageJson.scripts?.["test:android-collector"] !== undefined);
check("package script exists: verify:android-beta", packageJson.scripts?.["verify:android-beta"] !== undefined);

const androidBeta = readText("docs/android-beta.md");
check("Android Beta mentions diagnostics timeline", /diagnostics timeline/i.test(androidBeta));
check("Android Beta says FPS remains experimental", /FPS.*experimental/i.test(androidBeta));
check("Android Beta says logcat is not collected", /logcat/i.test(androidBeta));
check("Android Beta says bugreport is not collected", /bugreport/i.test(androidBeta));
check("Android Beta says no root", /No root/i.test(androidBeta));

const diagnostics = readText("docs/android-diagnostics.md");
check("diagnostics docs mention sanitized export", /sanitized/i.test(diagnostics) && /export/i.test(diagnostics));
check("diagnostics docs mention device-level network", /Device-level network/i.test(diagnostics));
check("diagnostics docs mention no bugreport", /No adb bugreport/i.test(diagnostics));

const limitations = readText("docs/platform-limitations.md");
check("platform limitations mention device_level", limitations.includes("device_level"));
check("platform limitations mention diagnostics exports", /Diagnostics exports/i.test(limitations));

const metricDefinitions = readText("docs/metric-definitions.md");
check("metric definitions say diagnostics are not fake metrics", /fake zero-valued metrics/i.test(metricDefinitions));

const openApi = readText("docs/openapi.yaml");
check("openapi contains session diagnostics API", openApi.includes("/api/sessions/{id}/diagnostics"));
check("openapi contains Android health API", openApi.includes("/api/android/{deviceId}/health"));

console.log("");
console.log("Android Beta checklist:");
console.log("- pnpm test:android-collector");
console.log("- pnpm test");
console.log("- pnpm typecheck");
console.log("- pnpm lint");
console.log("- pnpm build:desktop");
console.log("- no logcat/bugreport by default");
console.log("- no root/private API requirement");
console.log("- missing metrics remain N/A");
console.log("- device-level network is clearly marked");

if (process.exitCode === 1) {
  console.error("Android Beta verification failed");
} else {
  console.log("Android Beta verification passed");
}
