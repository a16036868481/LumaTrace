import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

interface PackageJson {
  scripts?: Record<string, string>;
}

const requiredFiles = [
  "README.md",
  "docs/README.md",
  "docs/architecture.md",
  "docs/api.md",
  "docs/openapi.yaml",
  "docs/platform-limitations.md",
  "docs/privacy-security.md",
  "docs/clean-room.md",
  "docs/third-party-licenses.md",
  "docs/metric-definitions.md",
  "docs/troubleshooting.md",
  "docs/development.md",
  "docs/mvp-a-acceptance.md",
  "docs/roadmap.md",
  "scripts/smoke-mvp-a.ts",
  "scripts/verify-mvp-a.ts",
  "apps/local-server/src/server.ts"
] as const;

const requiredScripts = [
  "test",
  "typecheck",
  "lint",
  "dev:server",
  "smoke:mvp-a",
  "verify:mvp-a"
] as const;

const requiredOpenApiSnippets = [
  "/api/devices",
  "/api/sessions",
  "/api/sessions/{id}/report",
  "MetricEvent:"
] as const;

function check(name: string, passed: boolean): void {
  console.log(`${passed ? "[ok]" : "[fail]"} ${name}`);
  if (!passed) {
    process.exitCode = 1;
  }
}

function readText(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

for (const file of requiredFiles) {
  check(`file exists: ${file}`, existsSync(resolve(file)));
}

const packageJson = JSON.parse(readText("package.json")) as PackageJson;
for (const script of requiredScripts) {
  check(`package script exists: ${script}`, packageJson.scripts?.[script] !== undefined);
}

const openApi = readText("docs/openapi.yaml");
for (const snippet of requiredOpenApiSnippets) {
  check(`openapi contains ${snippet}`, openApi.includes(snippet));
}

const docsReadme = readText("docs/README.md");
check("docs mention local-first", /local-first/i.test(docsReadme));
check("docs mention mock collector/data", /mock/i.test(docsReadme));

const limitations = readText("docs/platform-limitations.md");
check("limitations say MVP-A only uses MockCollector", limitations.includes("MockCollector"));
check("limitations say mock metrics are not real", /not represent real devices/i.test(limitations));

const cleanRoom = readText("docs/clean-room.md");
check("clean-room policy forbids copied commercial tools", /commercial tool/i.test(cleanRoom));

console.log("");
console.log("MVP-A checklist:");
console.log("- pnpm install");
console.log("- pnpm test");
console.log("- pnpm typecheck");
console.log("- pnpm lint");
console.log("- pnpm smoke:mvp-a");
console.log("- GET /api/health returns ok / mvp-a");
console.log("- Mock metrics have source, precision, and confidence");
console.log("- Reports and exports do not fabricate missing metrics");

if (process.exitCode === 1) {
  console.error("MVP-A verification failed");
} else {
  console.log("MVP-A verification passed");
}
