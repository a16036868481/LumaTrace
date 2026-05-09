import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

interface LicenseReviewItem {
  name: string;
  version?: string;
  componentType?: string;
  license: string;
  licenseSource?: string;
  noticeFileNames: string[];
  reviewStatus: string;
  privatePackage: boolean;
  needsHumanReview: boolean;
}

interface WindowsLicenseReviewTemplate {
  schemaVersion: 1;
  generatedAt: string;
  evidenceKind: "windows-license-review-template";
  status: "draft_requires_review";
  approved: false;
  productionReady: false;
  unsignedDraft: true;
  sourceNotices: {
    packagingNoticesFile: "packaging-notices.json";
    packagingNoticesSha256?: string;
    packagingNoticesSizeBytes?: number;
    thirdPartyNoticesFile: "THIRD-PARTY-NOTICES.md";
    thirdPartyNoticesSha256?: string;
    thirdPartyNoticesSizeBytes?: number;
  };
  reviewer: {
    name: null;
    completedAt: null;
    decision: "pending";
  };
  summary: {
    totalComponents: number;
    runtimeCount: number;
    packageCount: number;
    privatePackageCount: number;
    missingLicenseCount: number;
    reviewRequiredCount: number;
  };
  reviewItems: LicenseReviewItem[];
  completionRules: string[];
  securityAssertions: {
    tokenRedacted: true;
    fullLocalPathsRedacted: true;
    rawLogsExcluded: true;
    rawLicenseTextExcluded: true;
    stackTracesExcluded: true;
  };
  limitations: string[];
}

const root = process.cwd();
const releaseDir = resolve(root, "apps/desktop/src-tauri/target/release");
const binariesDir = resolve(root, "apps/desktop/src-tauri/binaries");
const noticesPath = resolve(binariesDir, "packaging-notices.json");
const thirdPartyNoticesPath = resolve(binariesDir, "THIRD-PARTY-NOTICES.md");
const outputPath = resolve(releaseDir, "lumatrace-windows-license-review-template.json");

function sha256(path: string): string | undefined {
  return existsSync(path) ? createHash("sha256").update(readFileSync(path)).digest("hex") : undefined;
}

function sizeBytes(path: string): number | undefined {
  return existsSync(path) ? statSync(path).size : undefined;
}

function objectField(value: JsonValue | undefined): Record<string, JsonValue> | undefined {
  return value !== null && value !== undefined && !Array.isArray(value) && typeof value === "object" ? value : undefined;
}

function stringField(object: Record<string, JsonValue>, name: string): string | undefined {
  const value = object[name];
  return typeof value === "string" ? value : undefined;
}

function booleanField(object: Record<string, JsonValue>, name: string): boolean {
  return object[name] === true;
}

function stringArrayField(object: Record<string, JsonValue>, name: string): string[] {
  const value = object[name];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function readNotices(): Record<string, JsonValue> {
  return existsSync(noticesPath) ? (JSON.parse(readFileSync(noticesPath, "utf8")) as Record<string, JsonValue>) : {};
}

function summarizeItems(notices: Record<string, JsonValue>): LicenseReviewItem[] {
  const entries = notices.entries;
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map((entry) => {
      const object = objectField(entry);
      if (object === undefined) {
        return undefined;
      }
      const name = stringField(object, "name");
      if (name === undefined) {
        return undefined;
      }
      const license = stringField(object, "license") ?? "UNKNOWN";
      const reviewStatus = stringField(object, "reviewStatus") ?? "unknown";
      return {
        name,
        ...(stringField(object, "version") === undefined ? {} : { version: stringField(object, "version") }),
        ...(stringField(object, "componentType") === undefined ? {} : { componentType: stringField(object, "componentType") }),
        license,
        ...(stringField(object, "licenseSource") === undefined ? {} : { licenseSource: stringField(object, "licenseSource") }),
        noticeFileNames: stringArrayField(object, "noticeFileNames"),
        reviewStatus,
        privatePackage: booleanField(object, "private"),
        needsHumanReview: reviewStatus !== "recorded" || license === "UNKNOWN"
      };
    })
    .filter((entry): entry is LicenseReviewItem => entry !== undefined);
}

const notices = readNotices();
const reviewItems = summarizeItems(notices);
const summaryObject = objectField(notices.summary);

const template: WindowsLicenseReviewTemplate = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  evidenceKind: "windows-license-review-template",
  status: "draft_requires_review",
  approved: false,
  productionReady: false,
  unsignedDraft: true,
  sourceNotices: {
    packagingNoticesFile: "packaging-notices.json",
    ...(sha256(noticesPath) === undefined ? {} : { packagingNoticesSha256: sha256(noticesPath) }),
    ...(sizeBytes(noticesPath) === undefined ? {} : { packagingNoticesSizeBytes: sizeBytes(noticesPath) }),
    thirdPartyNoticesFile: "THIRD-PARTY-NOTICES.md",
    ...(sha256(thirdPartyNoticesPath) === undefined ? {} : { thirdPartyNoticesSha256: sha256(thirdPartyNoticesPath) }),
    ...(sizeBytes(thirdPartyNoticesPath) === undefined ? {} : { thirdPartyNoticesSizeBytes: sizeBytes(thirdPartyNoticesPath) })
  },
  reviewer: {
    name: null,
    completedAt: null,
    decision: "pending"
  },
  summary: {
    totalComponents:
      typeof summaryObject?.totalComponents === "number" ? summaryObject.totalComponents : reviewItems.length,
    runtimeCount: typeof summaryObject?.runtimeCount === "number" ? summaryObject.runtimeCount : 0,
    packageCount: typeof summaryObject?.packageCount === "number" ? summaryObject.packageCount : 0,
    privatePackageCount:
      typeof summaryObject?.privatePackageCount === "number"
        ? summaryObject.privatePackageCount
        : reviewItems.filter((item) => item.privatePackage).length,
    missingLicenseCount:
      typeof summaryObject?.missingLicenseCount === "number"
        ? summaryObject.missingLicenseCount
        : reviewItems.filter((item) => item.license === "UNKNOWN").length,
    reviewRequiredCount: reviewItems.filter((item) => item.needsHumanReview).length
  },
  reviewItems,
  completionRules: [
    "A human reviewer must inspect packaging-notices.json and THIRD-PARTY-NOTICES.md before approving release.",
    "Private LumaTrace workspace packages may be marked internal, but that decision must be recorded outside this draft template.",
    "Missing or UNKNOWN licenses must be resolved or explicitly classified before RC approval.",
    "Approving this template is a human release process; this script never sets approved=true or productionReady=true."
  ],
  securityAssertions: {
    tokenRedacted: true,
    fullLocalPathsRedacted: true,
    rawLogsExcluded: true,
    rawLicenseTextExcluded: true,
    stackTracesExcluded: true
  },
  limitations: [
    "This template is a sanitized draft for license notice review only.",
    "It lists component metadata and hashes but does not include raw license text.",
    "It does not grant legal approval, configure signing, configure updater policy, or approve release.",
    "productionReady remains false."
  ]
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(template, null, 2)}\n`, "utf8");

console.log(`Windows license review template written to ${outputPath}`);
console.log(`status=${template.status}`);
console.log(`reviewRequiredCount=${String(template.summary.reviewRequiredCount)}`);
