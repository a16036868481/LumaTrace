import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

interface LicenseReviewItem {
  name?: unknown;
  version?: unknown;
  license?: unknown;
  reviewStatus?: unknown;
  privatePackage?: unknown;
  needsHumanReview?: unknown;
  reviewDecision?: unknown;
  resolution?: unknown;
  reviewerNote?: unknown;
}

interface WindowsLicenseReviewDocument {
  evidenceKind?: unknown;
  status?: unknown;
  approved?: unknown;
  productionReady?: unknown;
  unsignedDraft?: unknown;
  sourceNotices?: {
    packagingNoticesFile?: unknown;
    packagingNoticesSha256?: unknown;
    packagingNoticesSizeBytes?: unknown;
    thirdPartyNoticesFile?: unknown;
    thirdPartyNoticesSha256?: unknown;
    thirdPartyNoticesSizeBytes?: unknown;
  };
  reviewer?: {
    name?: unknown;
    completedAt?: unknown;
    decision?: unknown;
  };
  summary?: {
    totalComponents?: unknown;
    missingLicenseCount?: unknown;
    reviewRequiredCount?: unknown;
  };
  reviewItems?: LicenseReviewItem[];
  securityAssertions?: {
    tokenRedacted?: unknown;
    fullLocalPathsRedacted?: unknown;
    rawLogsExcluded?: unknown;
    rawLicenseTextExcluded?: unknown;
    stackTracesExcluded?: unknown;
  };
}

const root = process.cwd();
const releaseDir = resolve(root, "apps/desktop/src-tauri/target/release");
const defaultResultPath = resolve(releaseDir, "lumatrace-windows-license-review-result.json");
const templatePath = resolve(releaseDir, "lumatrace-windows-license-review-template.json");
const resultPathArg = process.argv[2];
const resultPath =
  resultPathArg === undefined
    ? defaultResultPath
    : isAbsolute(resultPathArg)
      ? resultPathArg
      : resolve(root, resultPathArg);

function check(name: string, passed: boolean): void {
  console.log(`${passed ? "[ok]" : "[fail]"} ${name}`);
  if (!passed) {
    process.exitCode = 1;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasReviewerNote(value: unknown): boolean {
  return typeof value === "string" && value.trim().length >= 4;
}

function hasCleanText(text: string): boolean {
  const normalized = text.replace(/\\\\/gu, "\\");
  return (
    !/Bearer\s+[A-Za-z0-9._~+/=-]+/u.test(normalized) &&
    !/lumatrace-auth\.[A-Za-z0-9._~+/=-]+/u.test(normalized) &&
    !/--auth-token\s+[A-Za-z0-9._~+/=-]+/u.test(normalized) &&
    !/LUMATRACE_AUTH_TOKEN\s*=\s*[A-Za-z0-9._~+/=-]+/u.test(normalized) &&
    !/"(?:authToken|token|secret)"\s*:\s*"[^"]{8,}"/u.test(normalized) &&
    !/[A-Z]:\\(?:Users|Documents and Settings|ProgramData|Windows|Temp)\\/iu.test(normalized) &&
    !/\/(?:Users|home)\/[^/\s"]+/iu.test(normalized) &&
    !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(normalized) &&
    !/"(?:rawLog|rawLogs|stdout|stderr|commandLine|rawCsv|stack|rawLicenseText)"\s*:/iu.test(normalized) &&
    !/\bat\s+[^\r\n]+:\d+:\d+/u.test(normalized) &&
    !/"productionReady"\s*:\s*true/u.test(normalized) &&
    !/"rcCandidateReady"\s*:\s*true/u.test(normalized)
  );
}

function readJson(path: string): WindowsLicenseReviewDocument {
  return JSON.parse(readFileSync(path, "utf8")) as WindowsLicenseReviewDocument;
}

function itemKey(item: LicenseReviewItem): string {
  return `${String(item.name)}@${String(item.version ?? "")}`;
}

check("license review template exists", existsSync(templatePath));
check("license review result exists", existsSync(resultPath));

if (!existsSync(templatePath) || !existsSync(resultPath)) {
  console.error(
    "Run pnpm verify:windows-license-review-template first, then pass a filled result JSON path to this verifier."
  );
  process.exit(1);
}

const templateText = readFileSync(templatePath, "utf8");
const resultText = readFileSync(resultPath, "utf8");
const template = JSON.parse(templateText) as WindowsLicenseReviewDocument;
const result = readJson(resultPath);
const templateItems = template.reviewItems ?? [];
const resultItems = result.reviewItems ?? [];
const templateKeys = templateItems.map(itemKey);
const resultKeys = resultItems.map(itemKey);
const resultKeySet = new Set(resultKeys);
const requiredReviewItems = resultItems.filter((item) => item.needsHumanReview === true || item.license === "UNKNOWN");

check("license review result is sanitized", hasCleanText(resultText));
check("result evidence kind is windows-license-review-result", result.evidenceKind === "windows-license-review-result");
check("result status is approved", result.status === "approved");
check("license review approved flag is true", result.approved === true);
check("productionReady remains false", result.productionReady === false);
check("unsigned draft remains explicit", result.unsignedDraft === true);
check("packaging notices file remains relative", result.sourceNotices?.packagingNoticesFile === "packaging-notices.json");
check("third-party notices file remains relative", result.sourceNotices?.thirdPartyNoticesFile === "THIRD-PARTY-NOTICES.md");
check(
  "packaging notices hash matches template",
  result.sourceNotices?.packagingNoticesSha256 === template.sourceNotices?.packagingNoticesSha256
);
check(
  "third-party notices hash matches template",
  result.sourceNotices?.thirdPartyNoticesSha256 === template.sourceNotices?.thirdPartyNoticesSha256
);
check("reviewer name is filled", isNonEmptyString(result.reviewer?.name));
check("reviewer completedAt is filled", isNonEmptyString(result.reviewer?.completedAt));
check("reviewer decision is approved", result.reviewer?.decision === "approved");
check("result has same review item count as template", resultItems.length === templateItems.length);
check("result item ids are unique", resultKeySet.size === resultItems.length);
check("result contains every template item", templateKeys.every((key) => resultKeySet.has(key)));
check("summary total matches template", result.summary?.totalComponents === template.summary?.totalComponents);
check("missing license count matches template", result.summary?.missingLicenseCount === template.summary?.missingLicenseCount);
check("review required count matches template", result.summary?.reviewRequiredCount === template.summary?.reviewRequiredCount);
check("all review items are approved", resultItems.every((item) => item.reviewDecision === "approved"));
check(
  "items requiring human review include reviewer notes",
  requiredReviewItems.every((item) => hasReviewerNote(item.reviewerNote))
);
check(
  "UNKNOWN license items include explicit resolution",
  resultItems.filter((item) => item.license === "UNKNOWN").every((item) => hasReviewerNote(item.resolution))
);
check("token redaction asserted", result.securityAssertions?.tokenRedacted === true);
check("path redaction asserted", result.securityAssertions?.fullLocalPathsRedacted === true);
check("raw logs excluded", result.securityAssertions?.rawLogsExcluded === true);
check("raw license text excluded", result.securityAssertions?.rawLicenseTextExcluded === true);
check("stack traces excluded", result.securityAssertions?.stackTracesExcluded === true);

if (process.exitCode === 1) {
  console.error("Windows license review result verification failed");
  process.exit(1);
}

console.log("Windows license review result verification passed");
