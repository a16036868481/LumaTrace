import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";

export type PackagingNoticeComponentType = "node-runtime" | "npm-package";
export type PackagingNoticeReviewStatus = "recorded" | "missing_license" | "draft_requires_review";

export interface PackagingNoticeEntry {
  name: string;
  version?: string;
  componentType: PackagingNoticeComponentType;
  license: string;
  licenseSource: "known_runtime" | "package_json" | "missing";
  noticeFileNames: string[];
  packagePath: string;
  private?: boolean;
  reviewStatus: PackagingNoticeReviewStatus;
}

export interface PackagingNoticeSummary {
  totalComponents: number;
  packageCount: number;
  runtimeCount: number;
  missingLicenseCount: number;
  privatePackageCount: number;
  draftReviewRequired: boolean;
}

export interface PackagingNoticeManifest {
  schemaVersion: 1;
  generatedAt: string;
  artifactKind: "self-contained" | "dev-wrapper";
  productionReady: boolean;
  licenseReviewStatus: "draft_requires_review" | "complete";
  bundledRuntime: {
    name: "Node.js";
    version?: string;
    license: "MIT";
    reviewStatus: "draft_requires_review";
  };
  entries: PackagingNoticeEntry[];
  summary: PackagingNoticeSummary;
  limitations: string[];
}

export interface BuildPackagingNoticeManifestOptions {
  runtimeAppDir: string;
  bundledNodeVersion?: string;
  artifactKind: "self-contained" | "dev-wrapper";
  productionReady: boolean;
  generatedAt?: string;
}

const LICENSE_FILE_PATTERN = /^(license|licence|copying|notice)(\..*)?$/iu;

function readPackageJson(path: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function normalizeLicense(value: unknown): { license: string; source: "package_json" | "missing" } {
  if (typeof value === "string" && value.trim().length > 0) {
    return { license: value.trim(), source: "package_json" };
  }
  if (value !== null && typeof value === "object") {
    const type = (value as { type?: unknown }).type;
    if (typeof type === "string" && type.trim().length > 0) {
      return { license: type.trim(), source: "package_json" };
    }
  }
  if (Array.isArray(value)) {
    const licenses = value
      .map((entry) => normalizeLicense(entry).license)
      .filter((entry) => entry !== "UNKNOWN");
    if (licenses.length > 0) {
      return { license: licenses.join(" OR "), source: "package_json" };
    }
  }
  return { license: "UNKNOWN", source: "missing" };
}

function listLicenseFiles(packageDir: string): string[] {
  try {
    return readdirSync(packageDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && LICENSE_FILE_PATTERN.test(entry.name))
      .map((entry) => basename(entry.name))
      .sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}

function packageDirsFromNodeModules(nodeModulesDir: string): string[] {
  if (!existsSync(nodeModulesDir)) {
    return [];
  }
  const packageDirs: string[] = [];
  for (const entry of readdirSync(nodeModulesDir, { withFileTypes: true })) {
    if (entry.name === ".bin" || entry.name === ".pnpm") {
      continue;
    }
    const entryPath = join(nodeModulesDir, entry.name);
    if (entry.name.startsWith("@") && entry.isDirectory()) {
      for (const scopedEntry of readdirSync(entryPath, { withFileTypes: true })) {
        if (scopedEntry.isDirectory() || scopedEntry.isSymbolicLink()) {
          packageDirs.push(join(entryPath, scopedEntry.name));
        }
      }
      continue;
    }
    if (entry.isDirectory() || entry.isSymbolicLink()) {
      packageDirs.push(entryPath);
    }
  }
  return packageDirs;
}

function packagePathLabel(name: string): string {
  return `node_modules/${name}`;
}

function packageEntry(packageDir: string): PackagingNoticeEntry | undefined {
  const packageJson = readPackageJson(join(packageDir, "package.json"));
  if (packageJson === undefined) {
    return undefined;
  }
  const name = typeof packageJson.name === "string" ? packageJson.name : basename(packageDir);
  const version = typeof packageJson.version === "string" ? packageJson.version : undefined;
  const license = normalizeLicense(packageJson.license);
  const privatePackage = packageJson.private === true;
  const missingLicense = license.source === "missing";
  return {
    name,
    ...(version === undefined ? {} : { version }),
    componentType: "npm-package",
    license: license.license,
    licenseSource: license.source,
    noticeFileNames: listLicenseFiles(packageDir),
    packagePath: packagePathLabel(name),
    ...(privatePackage ? { private: true } : {}),
    reviewStatus: missingLicense ? "missing_license" : "recorded"
  };
}

export function buildPackagingNoticeManifest(
  options: BuildPackagingNoticeManifestOptions
): PackagingNoticeManifest {
  const runtimeEntry: PackagingNoticeEntry = {
    name: "Node.js",
    ...(options.bundledNodeVersion === undefined ? {} : { version: options.bundledNodeVersion }),
    componentType: "node-runtime",
    license: "MIT",
    licenseSource: "known_runtime",
    noticeFileNames: [],
    packagePath: "lumatrace-local-server-runtime/node",
    reviewStatus: "draft_requires_review"
  };
  const nodeModulesDir = join(options.runtimeAppDir, "node_modules");
  const packageEntries = packageDirsFromNodeModules(nodeModulesDir)
    .map(packageEntry)
    .filter((entry): entry is PackagingNoticeEntry => entry !== undefined)
    .sort((left, right) => left.name.localeCompare(right.name));
  const entries = [runtimeEntry, ...packageEntries];
  const missingLicenseCount = entries.filter((entry) => entry.reviewStatus === "missing_license").length;
  const privatePackageCount = entries.filter((entry) => entry.private === true).length;
  const draftReviewRequired = true;

  return {
    schemaVersion: 1,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    artifactKind: options.artifactKind,
    productionReady: options.productionReady,
    licenseReviewStatus: "draft_requires_review",
    bundledRuntime: {
      name: "Node.js",
      ...(options.bundledNodeVersion === undefined ? {} : { version: options.bundledNodeVersion }),
      license: "MIT",
      reviewStatus: "draft_requires_review"
    },
    entries,
    summary: {
      totalComponents: entries.length,
      packageCount: packageEntries.length,
      runtimeCount: 1,
      missingLicenseCount,
      privatePackageCount,
      draftReviewRequired
    },
    limitations: [
      "This notice manifest is generated for packaging review and is not a substitute for release counsel review.",
      "Node.js is bundled as a runtime in the self-contained sidecar draft and requires final release notice review.",
      "Private LumaTrace workspace packages are listed as bundled components but are not third-party dependencies.",
      "productionReady remains false until license notice review, signing, installer QA, and release checks are complete."
    ]
  };
}

function markdownCell(value: string | undefined): string {
  return (value ?? "N/A").replace(/\|/gu, "\\|").replace(/\r?\n/gu, " ");
}

export function renderThirdPartyNoticesMarkdown(manifest: PackagingNoticeManifest): string {
  const rows = manifest.entries
    .map(
      (entry) =>
        `| ${markdownCell(entry.name)} | ${markdownCell(entry.version)} | ${entry.componentType} | ${markdownCell(entry.license)} | ${entry.reviewStatus} |`
    )
    .join("\n");
  return `# Third-Party Notices

Generated: ${manifest.generatedAt}

This draft notice file is generated from the bundled sidecar runtime. It is intended for packaging QA and release review. It is not a claim that production packaging, code signing, updater support, or store distribution is complete.

Production ready: ${manifest.productionReady ? "true" : "false"}
License review status: ${manifest.licenseReviewStatus}

## Summary

- Total components: ${manifest.summary.totalComponents}
- Runtime components: ${manifest.summary.runtimeCount}
- NPM packages: ${manifest.summary.packageCount}
- Missing license fields: ${manifest.summary.missingLicenseCount}
- Private workspace packages: ${manifest.summary.privatePackageCount}

## Components

| Name | Version | Type | License | Review |
| --- | --- | --- | --- | --- |
${rows}

## Limitations

${manifest.limitations.map((item) => `- ${item}`).join("\n")}
`;
}

export function packagingNoticeStats(path: string): { exists: boolean; sizeBytes?: number } {
  if (!existsSync(path)) {
    return { exists: false };
  }
  return {
    exists: true,
    sizeBytes: statSync(path).size
  };
}
