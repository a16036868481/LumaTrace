import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function check(name: string, passed: boolean): void {
  console.log(`${passed ? "[ok]" : "[fail]"} ${name}`);
  if (!passed) {
    process.exitCode = 1;
  }
}

function read(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

const requiredFiles = [
  "packages/collectors/ios/src/parsers/parseXctraceCsv.ts",
  "packages/collectors/ios/src/trace/IosTraceMetricMapper.ts",
  "packages/collectors/ios/src/trace/IosTraceImport.ts",
  "packages/collectors/ios/src/diagnostics/sanitizeIosTraceDiagnostic.ts",
  "packages/collectors/ios/test/parseXctraceCsv.test.ts",
  "packages/collectors/ios/test/IosTraceMetricMapper.test.ts",
  "packages/collectors/ios/test/IosTraceImport.test.ts",
  "packages/collectors/ios/test/sanitizeIosTraceDiagnostic.test.ts",
  "tests/fixtures/ios/xctrace_csv_sample.csv",
  "tests/fixtures/ios/xctrace_csv_average_only_sample.csv",
  "apps/local-server/src/routes/ios.ts",
  "apps/desktop/src/components/IosTraceImportPanel.tsx",
  "docs/ios-trace-import.md"
];

for (const file of requiredFiles) {
  check(`${file} exists`, existsSync(resolve(file)));
}

const packageJson = read("package.json");
check("verify:ios-trace-import script exists", packageJson.includes('"verify:ios-trace-import"'));

const parser = read("packages/collectors/ios/src/parsers/parseXctraceCsv.ts");
check("xctrace CSV parser ignores average FPS", /Average FPS column was ignored/iu.test(parser));
check("xctrace CSV parser is pure", !/readFile|CommandRunner|child_process|exec\(/iu.test(parser));

const mapper = read("packages/collectors/ios/src/trace/IosTraceMetricMapper.ts");
check("mapper emits ios:xctrace-csv-import source", mapper.includes("ios:xctrace-csv-import"));
check("mapper records manualTrace tag", mapper.includes("manualTrace: true"));
check("mapper blocks no-match metrics", mapper.includes('status !== "matched"'));
check("mapper records derivedFromFrameTime", mapper.includes("derivedFromFrameTime"));
check("mapper does not map average fps", !/averageFps/iu.test(mapper));

const sanitizer = read("packages/collectors/ios/src/diagnostics/sanitizeIosTraceDiagnostic.ts");
check("sanitizer redacts bearer token", sanitizer.includes("Bearer <redacted>"));
check("sanitizer redacts user path", sanitizer.includes("<user-path>"));
check("sanitizer redacts ios udid", sanitizer.includes("<ios-udid>"));

const docs = read("docs/ios-trace-import.md");
check("docs mention manual import", /manual xctrace CSV import/iu.test(docs));
check("docs mention no automatic capture", /does not start xctrace recording/iu.test(docs));
check("docs mention no average FPS frame time fabrication", /does not derive frame_time_ms from average FPS/iu.test(docs));
check("docs mention no match means no metrics", /no metrics are emitted/iu.test(docs));
check("docs mention sanitized diagnostics", /sanitized/iu.test(docs));
check("docs mention iOS trace import API", /\/api\/sessions\/:id\/ios\/trace-import/iu.test(docs));

const server = read("apps/local-server/src/server.ts");
check("local-server registers iOS routes", server.includes("registerIosRoutes"));

const iosRoute = read("apps/local-server/src/routes/ios.ts");
check("iOS import route exists", iosRoute.includes("/api/sessions/:id/ios/trace-import"));

const openapi = read("docs/openapi.yaml");
check("OpenAPI documents iOS trace import route", openapi.includes("/api/sessions/{id}/ios/trace-import"));

const ui = read("apps/desktop/src/components/IosTraceImportPanel.tsx");
check("desktop iOS import panel exists", ui.includes("Import iOS Trace CSV"));
check("desktop iOS import panel says manual import", ui.includes("manual import only"));

if (process.exitCode === 1) {
  console.error("iOS trace import verification failed");
} else {
  console.log("iOS trace import verification passed");
}
