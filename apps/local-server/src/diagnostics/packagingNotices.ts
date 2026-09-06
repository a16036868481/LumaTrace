import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

export type PackagingNoticeComponentType = "node-runtime" | "npm-package";
export type PackagingNoticeReviewStatus =
  | "recorded"
  | "missing_license"
  | "missing_notice"
  | "draft_requires_review";

export interface PackagingNoticeFile {
  fileName: string;
  distributionPath: string;
  sha256: string;
  sizeBytes: number;
  source: "bundled-package" | "pinned-license-asset";
}

export interface PackagingNoticeEntry {
  name: string;
  version?: string;
  componentType: PackagingNoticeComponentType;
  license: string;
  licenseSource: "known_runtime" | "package_json" | "missing";
  noticeFileNames: string[];
  noticeFiles: PackagingNoticeFile[];
  packagePath: string;
  private?: boolean;
  reviewStatus: PackagingNoticeReviewStatus;
}

export interface PackagingNoticeSummary {
  totalComponents: number;
  packageCount: number;
  runtimeCount: number;
  missingLicenseCount: number;
  missingNoticeFileCount: number;
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
    reviewStatus: PackagingNoticeReviewStatus;
  };
  entries: PackagingNoticeEntry[];
  summary: PackagingNoticeSummary;
  limitations: string[];
}

export interface BuildPackagingNoticeManifestOptions {
  runtimeAppDir: string;
  runtimeDir?: string;
  runtimeDistributionPath?: string;
  bundledNodeVersion?: string;
  artifactKind: "self-contained" | "dev-wrapper";
  productionReady: boolean;
  generatedAt?: string;
}

export interface PinnedLicenseAssetSpec {
  componentName: "Node.js" | "abstract-logging";
  componentVersion: "v24.14.0" | "2.0.1";
  repositoryPath: string;
  distributionPath: string;
  sha256: string;
}

export interface StagedLicenseAsset extends PinnedLicenseAssetSpec {
  sizeBytes: number;
}

const LICENSE_FILE_PATTERN = /^(license|licence|copying|notice)(\..*)?$/iu;
const DEFAULT_RUNTIME_DISTRIBUTION_PATH = "lumatrace-local-server-runtime";

export const PINNED_LICENSE_ASSETS: readonly PinnedLicenseAssetSpec[] = [
  {
    componentName: "Node.js",
    componentVersion: "v24.14.0",
    repositoryPath: "legal/third-party/node/v24.14.0/LICENSE",
    distributionPath: "NODE-LICENSE.txt",
    sha256: "4573185d56580da2b890ba34a85a409257640f1c5632eade4300137266194d18"
  },
  {
    componentName: "abstract-logging",
    componentVersion: "2.0.1",
    repositoryPath: "legal/third-party/abstract-logging/2.0.1/LICENSE",
    distributionPath: "THIRD-PARTY-LICENSES/abstract-logging-2.0.1-LICENSE.txt",
    sha256: "51d42d5384ab02fd8210ae3547fc0a8af7a385d2ac8f12685a6d3146fc2adafe"
  }
] as const;

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

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function slashPath(path: string): string {
  return path.replace(/\\/gu, "/");
}

function noticeFile(
  path: string,
  distributionPath: string,
  source: PackagingNoticeFile["source"]
): PackagingNoticeFile {
  return {
    fileName: basename(path),
    distributionPath: slashPath(distributionPath),
    sha256: sha256(path),
    sizeBytes: statSync(path).size,
    source
  };
}

function listLicenseFiles(
  packageDir: string,
  packageDistributionPath: string
): PackagingNoticeFile[] {
  try {
    return readdirSync(packageDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && LICENSE_FILE_PATTERN.test(entry.name))
      .map((entry) =>
        noticeFile(
          join(packageDir, entry.name),
          join(packageDistributionPath, entry.name),
          "bundled-package"
        )
      )
      .sort((left, right) => left.distributionPath.localeCompare(right.distributionPath));
  } catch {
    return [];
  }
}

function realPathKey(path: string): string {
  try {
    return realpathSync(path).toLowerCase();
  } catch {
    return resolve(path).toLowerCase();
  }
}

function directPackageDirs(nodeModulesDir: string): string[] {
  if (!existsSync(nodeModulesDir)) {
    return [];
  }
  const packageDirs: string[] = [];
  for (const entry of readdirSync(nodeModulesDir, { withFileTypes: true })) {
    if (entry.name === ".bin" || entry.name === ".pnpm") {
      continue;
    }
    const entryPath = join(nodeModulesDir, entry.name);
    if (entry.name.startsWith("@") && (entry.isDirectory() || entry.isSymbolicLink())) {
      for (const scopedEntry of readdirSync(entryPath, { withFileTypes: true })) {
        if (!scopedEntry.isDirectory() && !scopedEntry.isSymbolicLink()) {
          continue;
        }
        const packageDir = join(entryPath, scopedEntry.name);
        if (existsSync(join(packageDir, "package.json"))) {
          packageDirs.push(packageDir);
        }
      }
      continue;
    }
    if (
      (entry.isDirectory() || entry.isSymbolicLink()) &&
      existsSync(join(entryPath, "package.json"))
    ) {
      packageDirs.push(entryPath);
    }
  }
  return packageDirs;
}

function packageDirsFromNodeModules(nodeModulesDir: string): string[] {
  const packageDirs: string[] = [];
  const pendingNodeModules = [nodeModulesDir];
  const visitedNodeModules = new Set<string>();
  const visitedPackages = new Set<string>();

  while (pendingNodeModules.length > 0) {
    const currentNodeModules = pendingNodeModules.pop();
    if (currentNodeModules === undefined || !existsSync(currentNodeModules)) {
      continue;
    }
    const nodeModulesKey = realPathKey(currentNodeModules);
    if (visitedNodeModules.has(nodeModulesKey)) {
      continue;
    }
    visitedNodeModules.add(nodeModulesKey);

    for (const packageDir of directPackageDirs(currentNodeModules)) {
      const packageKey = realPathKey(packageDir);
      if (!visitedPackages.has(packageKey)) {
        packageDirs.push(packageDir);
        visitedPackages.add(packageKey);
      }
      const nestedNodeModules = join(packageDir, "node_modules");
      if (existsSync(nestedNodeModules)) {
        pendingNodeModules.push(nestedNodeModules);
      }
    }
  }

  return packageDirs;
}

function runtimeDistributionPath(options: BuildPackagingNoticeManifestOptions): string {
  return slashPath(options.runtimeDistributionPath ?? DEFAULT_RUNTIME_DISTRIBUTION_PATH).replace(
    /\/$/u,
    ""
  );
}

function stagedPinnedNoticeFiles(
  options: BuildPackagingNoticeManifestOptions,
  name: string,
  version: string | undefined
): PackagingNoticeFile[] {
  if (options.runtimeDir === undefined || version === undefined) {
    return [];
  }
  const distributionRoot = runtimeDistributionPath(options);
  return PINNED_LICENSE_ASSETS.filter(
    (asset) => asset.componentName === name && asset.componentVersion === version
  )
    .map((asset) => {
      const stagedPath = resolve(options.runtimeDir as string, asset.distributionPath);
      if (!existsSync(stagedPath) || sha256(stagedPath) !== asset.sha256) {
        return undefined;
      }
      return noticeFile(
        stagedPath,
        join(distributionRoot, asset.distributionPath),
        "pinned-license-asset"
      );
    })
    .filter((entry): entry is PackagingNoticeFile => entry !== undefined);
}

function packageEntry(
  packageDir: string,
  options: BuildPackagingNoticeManifestOptions
): PackagingNoticeEntry | undefined {
  const packageJson = readPackageJson(join(packageDir, "package.json"));
  if (packageJson === undefined) {
    return undefined;
  }
  const name = typeof packageJson.name === "string" ? packageJson.name : basename(packageDir);
  const version = typeof packageJson.version === "string" ? packageJson.version : undefined;
  const license = normalizeLicense(packageJson.license);
  const privatePackage = packageJson.private === true;
  const packagePath = slashPath(relative(options.runtimeAppDir, packageDir));
  const packageDistributionPath = join(runtimeDistributionPath(options), "app", packagePath);
  const noticeFiles = [
    ...listLicenseFiles(packageDir, packageDistributionPath),
    ...stagedPinnedNoticeFiles(options, name, version)
  ].sort((left, right) => left.distributionPath.localeCompare(right.distributionPath));
  const missingLicense = license.source === "missing";
  const missingNotice = !privatePackage && noticeFiles.length === 0;
  return {
    name,
    ...(version === undefined ? {} : { version }),
    componentType: "npm-package",
    license: license.license,
    licenseSource: license.source,
    noticeFileNames: noticeFiles.map((entry) => entry.fileName),
    noticeFiles,
    packagePath,
    ...(privatePackage ? { private: true } : {}),
    reviewStatus: missingLicense ? "missing_license" : missingNotice ? "missing_notice" : "recorded"
  };
}

export function stagePinnedLicenseAssetsForRuntime(options: {
  repositoryRoot: string;
  runtimeDir: string;
  bundledNodeVersion: string;
}): StagedLicenseAsset[] {
  const nodeLicenseAsset = PINNED_LICENSE_ASSETS.find((asset) => asset.componentName === "Node.js");
  if (
    nodeLicenseAsset === undefined ||
    nodeLicenseAsset.componentVersion !== options.bundledNodeVersion
  ) {
    throw new Error(
      `No pinned Node.js license asset matches bundled runtime ${options.bundledNodeVersion}`
    );
  }
  return PINNED_LICENSE_ASSETS.map((asset) => {
    const sourcePath = resolve(options.repositoryRoot, asset.repositoryPath);
    if (!existsSync(sourcePath)) {
      throw new Error(`Pinned license asset is missing: ${asset.repositoryPath}`);
    }
    const sourceHash = sha256(sourcePath);
    if (sourceHash !== asset.sha256) {
      throw new Error(`Pinned license asset hash mismatch: ${asset.repositoryPath}`);
    }
    const destinationPath = resolve(options.runtimeDir, asset.distributionPath);
    mkdirSync(dirname(destinationPath), { recursive: true });
    copyFileSync(sourcePath, destinationPath);
    if (sha256(destinationPath) !== asset.sha256) {
      throw new Error(`Staged license asset hash mismatch: ${asset.distributionPath}`);
    }
    return {
      ...asset,
      sizeBytes: statSync(destinationPath).size
    };
  });
}

export function buildPackagingNoticeManifest(
  options: BuildPackagingNoticeManifestOptions
): PackagingNoticeManifest {
  const runtimeNoticeFiles = stagedPinnedNoticeFiles(
    options,
    "Node.js",
    options.bundledNodeVersion
  );
  const runtimeEntry: PackagingNoticeEntry = {
    name: "Node.js",
    ...(options.bundledNodeVersion === undefined ? {} : { version: options.bundledNodeVersion }),
    componentType: "node-runtime",
    license: "MIT",
    licenseSource: "known_runtime",
    noticeFileNames: runtimeNoticeFiles.map((entry) => entry.fileName),
    noticeFiles: runtimeNoticeFiles,
    packagePath: `${runtimeDistributionPath(options)}/node`,
    reviewStatus: runtimeNoticeFiles.length > 0 ? "recorded" : "draft_requires_review"
  };
  const nodeModulesDir = join(options.runtimeAppDir, "node_modules");
  const packageEntries = packageDirsFromNodeModules(nodeModulesDir)
    .map((packageDir) => packageEntry(packageDir, options))
    .filter((entry): entry is PackagingNoticeEntry => entry !== undefined)
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name) ||
        (left.version ?? "").localeCompare(right.version ?? "") ||
        left.packagePath.localeCompare(right.packagePath)
    );
  const entries = [runtimeEntry, ...packageEntries];
  const missingLicenseCount = entries.filter(
    (entry) => entry.reviewStatus === "missing_license"
  ).length;
  const missingNoticeFileCount = entries.filter(
    (entry) => entry.private !== true && entry.noticeFiles.length === 0
  ).length;
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
      reviewStatus: runtimeEntry.reviewStatus
    },
    entries,
    summary: {
      totalComponents: entries.length,
      packageCount: packageEntries.length,
      runtimeCount: 1,
      missingLicenseCount,
      missingNoticeFileCount,
      privatePackageCount,
      draftReviewRequired
    },
    limitations: [
      "This notice manifest is generated for packaging review and is not a substitute for release counsel review.",
      "Every noticeFiles entry binds a redistributed license file by relative distribution path, byte size, and SHA-256 hash.",
      "The exact Node.js version license must be staged beside the bundled runtime before Store packaging.",
      "Private LumaTrace workspace packages are listed as bundled components but are not third-party dependencies.",
      "productionReady remains false until license notice review, signing, installer QA, and release checks are complete."
    ]
  };
}

function markdownCell(value: string | undefined): string {
  return (value ?? "N/A").replace(/\|/gu, "\\|").replace(/\r?\n/gu, " ");
}

function noticeFileCell(entry: PackagingNoticeEntry): string {
  if (entry.noticeFiles.length === 0) {
    return entry.private === true ? "first-party" : "MISSING";
  }
  return entry.noticeFiles.map((file) => `\`${file.distributionPath}\``).join("<br>");
}

export function renderThirdPartyNoticesMarkdown(manifest: PackagingNoticeManifest): string {
  const rows = manifest.entries
    .map(
      (entry) =>
        `| ${markdownCell(entry.name)} | ${markdownCell(entry.version)} | ${entry.componentType} | ${markdownCell(entry.license)} | ${entry.reviewStatus} | ${noticeFileCell(entry)} |`
    )
    .join("\n");
  const bindings = manifest.entries
    .filter((entry) => entry.private !== true)
    .flatMap((entry) =>
      entry.noticeFiles.length === 0
        ? [`- **MISSING** — ${entry.name}@${entry.version ?? "N/A"} has no retained license file.`]
        : entry.noticeFiles.map(
            (file) =>
              `- \`${file.distributionPath}\` — SHA-256 \`${file.sha256}\`; ${file.sizeBytes} bytes; ${file.source}; ${entry.name}@${entry.version ?? "N/A"}.`
          )
    )
    .join("\n");
  return `# Third-Party Notices

Generated: ${manifest.generatedAt}

This distributable notice index is generated from the bundled sidecar runtime. The exact license files listed in **License file bindings** are an integral part of this notice: they must remain in the distributed package at the stated relative paths and with the stated SHA-256 hashes. This index does not replace those full license texts.

Production ready: ${manifest.productionReady ? "true" : "false"}
License review status: ${manifest.licenseReviewStatus}

## Summary

- Total components: ${manifest.summary.totalComponents}
- Runtime components: ${manifest.summary.runtimeCount}
- NPM packages: ${manifest.summary.packageCount}
- Missing license fields: ${manifest.summary.missingLicenseCount}
- Missing retained license files: ${manifest.summary.missingNoticeFileCount}
- Private workspace packages: ${manifest.summary.privatePackageCount}

## Components

| Name | Version | Type | License | Review | Retained license files |
| --- | --- | --- | --- | --- | --- |
${rows}

## License file bindings

${bindings}

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
