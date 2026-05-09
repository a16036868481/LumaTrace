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
  "packages/collectors/ios/src/IosCollector.ts",
  "packages/collectors/ios/src/tools/XcrunToolClient.ts",
  "packages/collectors/ios/src/parsers/parseXctraceListDevices.ts",
  "packages/collectors/ios/src/parsers/parseSimctlListApps.ts",
  "packages/collectors/ios/src/parsers/parseXctraceCsv.ts",
  "packages/collectors/ios/src/trace/IosTraceImport.ts",
  "packages/collectors/ios/src/trace/IosXctraceCaptureCommand.ts",
  "packages/collectors/ios/src/trace/IosXctraceCaptureRuntime.ts",
  "packages/collectors/ios/src/trace/IosTraceMetricMapper.ts",
  "packages/collectors/ios/src/diagnostics/sanitizeIosTraceDiagnostic.ts",
  "packages/collectors/ios/test/IosCollector.test.ts",
  "packages/collectors/ios/test/IosTraceImport.test.ts",
  "packages/collectors/ios/test/IosXctraceCaptureCommand.test.ts",
  "packages/collectors/ios/test/IosXctraceCaptureRuntime.test.ts",
  "apps/local-server/src/routes/ios.ts",
  "apps/local-server/test/iosIntegration.test.ts",
  "apps/desktop/src/components/IosTraceImportPanel.tsx",
  "docs/ios-foundation.md",
  "docs/ios-trace-import.md",
  "docs/ios-beta.md",
  "docs/ios-real-device-checklist.md"
];

for (const file of requiredFiles) {
  check(`${file} exists`, existsSync(resolve(file)));
}

const packageJson = read("package.json");
check("test:ios-collector script exists", packageJson.includes('"test:ios-collector"'));
check("verify:ios-foundation script exists", packageJson.includes('"verify:ios-foundation"'));
check("verify:ios-trace-import script exists", packageJson.includes('"verify:ios-trace-import"'));
check("verify:ios-beta script exists", packageJson.includes('"verify:ios-beta"'));

const collector = read("packages/collectors/ios/src/IosCollector.ts");
check("iOS startSession remains unavailable", collector.includes("IOS_SESSION_REQUIRES_MANUAL_TRACE"));
check("iOS device IDs are hashed", collector.includes("createHash"));
check("iOS UDIDs are masked", collector.includes("maskedUdid"));

const capabilities = read("packages/collectors/ios/src/availability/iosCapabilities.ts");
check("iOS CPU requires manual trace", capabilities.includes("requires_manual_trace") && capabilities.includes("CPU_PERCENT"));
check("iOS FPS requires manual trace", capabilities.includes("requires_manual_trace") && capabilities.includes("FPS"));
check("iOS xctrace capture is experimental when xcrun is available", capabilities.includes("ios.xctrace_capture") && capabilities.includes("experimental"));
check("iOS target network unavailable", capabilities.includes("NETWORK_RX_BYTES") && capabilities.includes('status: "unavailable"'));

const csvParser = read("packages/collectors/ios/src/parsers/parseXctraceCsv.ts");
check("xctrace parser ignores average FPS", csvParser.includes("Average FPS column was ignored"));
check("xctrace parser remains pure", !/readFile|CommandRunner|child_process|exec\(/u.test(csvParser));

const mapper = read("packages/collectors/ios/src/trace/IosTraceMetricMapper.ts");
check("iOS import source is explicit", mapper.includes("ios:xctrace-csv-import"));
check("iOS import marks manualTrace", mapper.includes("manualTrace: true"));
check("iOS import blocks no-match metrics", mapper.includes('status !== "matched"'));
check("iOS import does not map average FPS", !/averageFps/iu.test(mapper));

const captureCommand = read("packages/collectors/ios/src/trace/IosXctraceCaptureCommand.ts");
check("iOS xctrace capture command uses args arrays", captureCommand.includes("args = [") && !/exec\(|spawn\(|child_process/iu.test(captureCommand));
check("iOS xctrace capture duration is capped", captureCommand.includes("MAX_DURATION_MS") && captureCommand.includes("120_000"));

const captureRuntime = read("packages/collectors/ios/src/trace/IosXctraceCaptureRuntime.ts");
check("iOS automatic capture uses CommandRunner", captureRuntime.includes("commandRunner.run"));
check("iOS automatic capture supports TOC-only result", captureRuntime.includes("trace_recorded") && captureRuntime.includes("IOS_XCTRACE_RECORDED_TOC_ONLY"));
check("iOS automatic capture blocks no-match metrics", captureRuntime.includes('status = imported.metrics.length > 0 ? "success" : "no_data"'));

const sanitizer = read("packages/collectors/ios/src/diagnostics/sanitizeIosTraceDiagnostic.ts");
check("iOS sanitizer redacts bearer token", sanitizer.includes("Bearer <redacted>"));
check("iOS sanitizer redacts user paths", sanitizer.includes("<user-path>"));
check("iOS sanitizer redacts UDIDs", sanitizer.includes("<ios-udid>"));

const server = read("apps/local-server/src/server.ts");
check("local-server registers iOS routes", server.includes("registerIosRoutes"));
check("local-server registers IosCollector", server.includes("new IosCollector()"));

const iosRoute = read("apps/local-server/src/routes/ios.ts");
check("iOS trace import API route exists", iosRoute.includes("/api/sessions/:id/ios/trace-import"));
check("iOS automatic xctrace capture API route exists", iosRoute.includes("/api/sessions/:id/ios/xctrace-capture"));

const integrationTest = read("apps/local-server/test/iosIntegration.test.ts");
check("local-server iOS import stores metrics", integrationTest.includes("imports manual xctrace CSV metrics into storage"));
check("local-server iOS xctrace capture stores metrics", integrationTest.includes("runs automatic xctrace capture into storage"));
check("local-server iOS diagnostics omit raw CSV", integrationTest.includes('not.toContain("Time (s),Process")'));

const ui = read("apps/desktop/src/components/IosTraceImportPanel.tsx");
check("desktop iOS panel is manual import only", ui.includes("manual import only"));
check("desktop iOS panel exposes explicit xctrace capture", ui.includes("Run automatic xctrace capture") && ui.includes("explicit action only"));
check("desktop iOS panel excludes raw CSV diagnostics", ui.includes("raw CSV excluded from diagnostics"));

const apiDocs = read("docs/api.md");
check("API docs mention iOS trace import route", apiDocs.includes("/api/sessions/:id/ios/trace-import"));
check("API docs mention iOS xctrace capture route", apiDocs.includes("/api/sessions/:id/ios/xctrace-capture"));
check("API docs mention no raw CSV diagnostics", /Raw CSV is not written to diagnostics or reports/iu.test(apiDocs));

const openapi = read("docs/openapi.yaml");
check("OpenAPI documents iOS trace import route", openapi.includes("/api/sessions/{id}/ios/trace-import"));
check("OpenAPI documents iOS xctrace capture route", openapi.includes("/api/sessions/{id}/ios/xctrace-capture"));
check("OpenAPI exposes requires_manual_trace", openapi.includes("requires_manual_trace"));

const docs = `${read("docs/ios-foundation.md")}\n${read("docs/ios-trace-import.md")}\n${read("docs/ios-beta.md")}\n${read("docs/ios-real-device-checklist.md")}`;
check("iOS docs mention no private APIs", /No private APIs|does not use private APIs/iu.test(docs));
check("iOS docs mention no jailbreak", /No jailbreak|jailbreak/iu.test(docs));
check("iOS docs mention automatic xctrace capture is explicit", /automatic capture is explicit|explicit automatic xctrace capture|explicit macOS\/Xcode xctrace/iu.test(docs));
check("iOS docs mention no default xctrace recording", /does not start xctrace recording by default|No default automatic xctrace recording/iu.test(docs));
check("iOS docs mention no syslog by default", /syslog/iu.test(docs));
check("iOS docs mention missing metrics are N/A/not zero", /N\/A|not.*zero|fake zero/iu.test(docs));
check("iOS docs mention sanitized diagnostics", /sanitized/iu.test(docs));
check("iOS docs mention real-device checklist", /real-device checklist|real device checklist/iu.test(docs));

const readme = read("README.md");
check("README includes verify:ios-beta", readme.includes("pnpm verify:ios-beta"));

if (process.exitCode === 1) {
  console.error("iOS Beta verification failed");
} else {
  console.log("iOS Beta verification passed");
}
