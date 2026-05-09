import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

interface SidecarManifest {
  artifactKind?: string;
  productionReady?: boolean;
  noticesFile?: string;
  noticesSha256?: string;
  thirdPartyNoticesFile?: string;
  thirdPartyNoticesSha256?: string;
  licenseReviewStatus?: string;
}

interface PackagingNoticeManifest {
  productionReady?: boolean;
  licenseReviewStatus?: string;
  bundledRuntime?: {
    name?: string;
    license?: string;
  };
  entries?: Array<{
    name?: string;
    componentType?: string;
    license?: string;
    packagePath?: string;
    reviewStatus?: string;
  }>;
  summary?: {
    totalComponents?: number;
    packageCount?: number;
    runtimeCount?: number;
    draftReviewRequired?: boolean;
  };
}

const binariesDir = resolve("apps/desktop/src-tauri/binaries");
const manifestPath = resolve(binariesDir, "sidecar-manifest.json");

function hashFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function check(name: string, passed: boolean): void {
  console.log(`${passed ? "[ok]" : "[fail]"} ${name}`);
  if (!passed) {
    process.exitCode = 1;
  }
}

function assertCleanArtifactText(name: string, text: string): void {
  check(`${name} has no bearer token`, !/Bearer\s+[A-Za-z0-9._~+/=-]+/u.test(text));
  check(`${name} has no auth subprotocol token`, !/lumatrace-auth\.[A-Za-z0-9._~+/=-]+/u.test(text));
  check(`${name} has no Windows user path`, !/[A-Z]:\\Users\\/iu.test(text));
  check(`${name} has no Unix user path`, !/\/(?:Users|home)\/[^/\s"]+/u.test(text));
  check(`${name} has no raw CSV path`, !/PresentMon[\\/][^"\s]+\.csv/iu.test(text));
}

check("sidecar manifest exists", existsSync(manifestPath));
if (!existsSync(manifestPath)) {
  process.exit(1);
}

const manifest = readJson<SidecarManifest>(manifestPath);
const noticesPath =
  manifest.noticesFile === undefined ? undefined : resolve(binariesDir, manifest.noticesFile);
const thirdPartyPath =
  manifest.thirdPartyNoticesFile === undefined ? undefined : resolve(binariesDir, manifest.thirdPartyNoticesFile);

check("manifest is self-contained for notice verification", manifest.artifactKind === "self-contained");
check("manifest remains productionReady=false", manifest.productionReady === false);
check("manifest license review is draft", manifest.licenseReviewStatus === "draft_requires_review");
check("packaging notices file is declared", noticesPath !== undefined);
check("third-party notices file is declared", thirdPartyPath !== undefined);
check("packaging notices file exists", noticesPath !== undefined && existsSync(noticesPath));
check("third-party notices file exists", thirdPartyPath !== undefined && existsSync(thirdPartyPath));

if (noticesPath !== undefined && existsSync(noticesPath)) {
  check("packaging notices hash matches manifest", manifest.noticesSha256 === hashFile(noticesPath));
  const noticesText = readFileSync(noticesPath, "utf8");
  assertCleanArtifactText("packaging notices", noticesText);
  const notices = readJson<PackagingNoticeManifest>(noticesPath);
  check("packaging notices remain productionReady=false", notices.productionReady === false);
  check("packaging notices require draft review", notices.licenseReviewStatus === "draft_requires_review");
  check("packaging notices include Node.js runtime", notices.bundledRuntime?.name === "Node.js");
  check("Node.js runtime license recorded", notices.bundledRuntime?.license === "MIT");
  check("packaging notices include components", (notices.summary?.totalComponents ?? 0) > 1);
  check("packaging notices include npm packages", (notices.summary?.packageCount ?? 0) > 0);
  check("packaging notices include runtime count", notices.summary?.runtimeCount === 1);
  check("packaging notices mark draft review required", notices.summary?.draftReviewRequired === true);
  check(
    "packaging notices include lumatrace workspace packages",
    notices.entries?.some((entry) => entry.name?.startsWith("@lumatrace/")) === true
  );
}

if (thirdPartyPath !== undefined && existsSync(thirdPartyPath)) {
  check("third-party notices hash matches manifest", manifest.thirdPartyNoticesSha256 === hashFile(thirdPartyPath));
  const thirdPartyText = readFileSync(thirdPartyPath, "utf8");
  assertCleanArtifactText("third-party notices", thirdPartyText);
  check("third-party notices mention productionReady false", /Production ready: false/u.test(thirdPartyText));
  check("third-party notices include component table", /\| Name \| Version \| Type \| License \| Review \|/u.test(thirdPartyText));
}

if (process.exitCode === 1) {
  console.error("Packaging notices verification failed");
} else {
  console.log("Packaging notices verification passed");
}
