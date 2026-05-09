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
  "packages/collectors/ios/package.json",
  "packages/collectors/ios/src/IosCollector.ts",
  "packages/collectors/ios/src/tools/XcrunToolClient.ts",
  "packages/collectors/ios/src/parsers/parseXctraceListDevices.ts",
  "packages/collectors/ios/src/parsers/parseSimctlListApps.ts",
  "packages/collectors/ios/src/availability/iosCapabilities.ts",
  "packages/collectors/ios/test/IosCollector.test.ts",
  "tests/fixtures/ios/xctrace_devices_sample.txt",
  "tests/fixtures/ios/simctl_listapps_sample.json",
  "docs/ios-foundation.md"
];

for (const file of requiredFiles) {
  check(`${file} exists`, existsSync(resolve(file)));
}

const packageJson = read("package.json");
check("test:ios-collector script exists", packageJson.includes('"test:ios-collector"'));
check("verify:ios-foundation script exists", packageJson.includes('"verify:ios-foundation"'));

const localServerPackage = read("apps/local-server/package.json");
check("local-server depends on collectors-ios", localServerPackage.includes('"@lumatrace/collectors-ios"'));

const server = read("apps/local-server/src/server.ts");
check("local-server registers IosCollector", server.includes("new IosCollector()"));
check("local-server records xcrun tool status", server.includes('toolName: "xcrun"'));

const capabilities = read("packages/collectors/ios/src/availability/iosCapabilities.ts");
check("iOS CPU requires manual trace", capabilities.includes('metricName: METRIC_NAMES.CPU_PERCENT') && capabilities.includes('status: "requires_manual_trace"'));
check("iOS FPS requires manual trace", capabilities.includes('metricName: METRIC_NAMES.FPS') && capabilities.includes('status: "requires_manual_trace"'));
check("iOS process network unavailable", capabilities.includes('metricName: METRIC_NAMES.NETWORK_RX_BYTES') && capabilities.includes('status: "unavailable"'));

const collector = read("packages/collectors/ios/src/IosCollector.ts");
check("iOS startSession fails clearly", collector.includes("IOS_SESSION_REQUIRES_MANUAL_TRACE"));
check("iOS device IDs hash UDID", collector.includes("createHash"));
check("iOS tags mask UDID", collector.includes("maskedUdid"));

const docs = read("docs/ios-foundation.md");
check("docs mention no private APIs", /No private APIs/iu.test(docs));
check("docs mention no jailbreak", /No jailbreak/iu.test(docs));
check("docs mention no fake metrics", /must not display fake zero/iu.test(docs));
check("docs mention xcrun", /xcrun xctrace list devices/iu.test(docs));

if (process.exitCode === 1) {
  console.error("iOS Foundation verification failed");
} else {
  console.log("iOS Foundation verification passed");
}
