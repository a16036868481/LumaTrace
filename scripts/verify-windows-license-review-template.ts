import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

interface LicenseReviewItem {
  name?: unknown;
  license?: unknown;
  reviewStatus?: unknown;
  privatePackage?: unknown;
  needsHumanReview?: unknown;
}

interface WindowsLicenseReviewTemplate {
  evidenceKind?: unknown;
  status?: unknown;
  approved?: unknown;
  productionReady?: unknown;
  unsignedDraft?: unknown;
  sourceNotices?: {
    packagingNoticesFile?: unknown;
    packagingNoticesSha256?: unknown;
    thirdPartyNoticesFile?: unknown;
    thirdPartyNoticesSha256?: unknown;
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

const templatePath = resolve("apps/desktop/src-tauri/target/release/lumatrace-windows-license-review-template.json");

function check(name: string, passed: boolean): void {
  console.log(`${passed ? "[ok]" : "[fail]"} ${name}`);
  if (!passed) {
    process.exitCode = 1;
  }
}

function clean(text: string): boolean {
  const normalized = text.replace(/\\\\/gu, "\\");
  return (
    !/Bearer\s+[A-Za-z0-9._~+/=-]+/u.test(normalized) &&
    !/lumatrace-auth\.[A-Za-z0-9._~+/=-]+/u.test(normalized) &&
    !/[A-Z]:\\(?:Users|Documents and Settings|ProgramData|Windows|Temp)\\/iu.test(normalized) &&
    !/\/(?:Users|home)\/[^/\s"]+/iu.test(normalized) &&
    !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(normalized) &&
    !/"(?:rawLog|rawLogs|stdout|stderr|commandLine|rawCsv|stack|token|secret)"\s*:/iu.test(normalized) &&
    !/\bat\s+[^\r\n]+:\d+:\d+/u.test(normalized) &&
    !/"approved"\s*:\s*true/u.test(normalized) &&
    !/"productionReady"\s*:\s*true/u.test(normalized)
  );
}

check("Windows license review template exists", existsSync(templatePath));
if (!existsSync(templatePath)) {
  process.exit(1);
}

const text = readFileSync(templatePath, "utf8");
const template = JSON.parse(text) as WindowsLicenseReviewTemplate;
const reviewItems = template.reviewItems ?? [];
const needsHumanReviewCount = reviewItems.filter((item) => item.needsHumanReview === true).length;

check("license review template is sanitized", clean(text));
check("evidence kind is windows-license-review-template", template.evidenceKind === "windows-license-review-template");
check("template status remains draft_requires_review", template.status === "draft_requires_review");
check("license review is not approved", template.approved === false);
check("productionReady remains false", template.productionReady === false);
check("unsigned draft remains true", template.unsignedDraft === true);
check("packaging notices file is relative", template.sourceNotices?.packagingNoticesFile === "packaging-notices.json");
check("third-party notices file is relative", template.sourceNotices?.thirdPartyNoticesFile === "THIRD-PARTY-NOTICES.md");
check("packaging notices hash recorded", typeof template.sourceNotices?.packagingNoticesSha256 === "string");
check("third-party notices hash recorded", typeof template.sourceNotices?.thirdPartyNoticesSha256 === "string");
check("reviewer name starts empty", template.reviewer?.name === null);
check("reviewer completedAt starts empty", template.reviewer?.completedAt === null);
check("reviewer decision starts pending", template.reviewer?.decision === "pending");
check("review items are present", reviewItems.length > 0);
check("summary total matches review items", template.summary?.totalComponents === reviewItems.length);
check("missing license count is recorded", typeof template.summary?.missingLicenseCount === "number");
check("review required count matches items", template.summary?.reviewRequiredCount === needsHumanReviewCount);
check("LumaTrace private packages remain explicit", reviewItems.some((item) => item.privatePackage === true));
check("UNKNOWN licenses remain explicit", reviewItems.some((item) => item.license === "UNKNOWN"));
check("token redaction asserted", template.securityAssertions?.tokenRedacted === true);
check("path redaction asserted", template.securityAssertions?.fullLocalPathsRedacted === true);
check("raw logs excluded", template.securityAssertions?.rawLogsExcluded === true);
check("raw license text excluded", template.securityAssertions?.rawLicenseTextExcluded === true);
check("stack traces excluded", template.securityAssertions?.stackTracesExcluded === true);

if (process.exitCode === 1) {
  console.error("Windows license review template verification failed");
  process.exit(1);
}

console.log("Windows license review template verification passed");
