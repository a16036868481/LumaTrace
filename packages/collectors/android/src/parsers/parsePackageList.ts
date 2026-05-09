import type { PackageListParseResult, AndroidPackage } from "../types";

export function parsePackageList(output: string): PackageListParseResult {
  const packages: AndroidPackage[] = [];
  const warnings: string[] = [];

  for (const line of output.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    if (!trimmed.startsWith("package:")) {
      warnings.push(`Ignoring non-package line: ${trimmed}`);
      continue;
    }

    const payload = trimmed.slice("package:".length);
    if (payload.length === 0) {
      warnings.push("Ignoring empty package line.");
      continue;
    }

    const separatorIndex = payload.lastIndexOf("=");
    if (separatorIndex > 0) {
      const apkPath = payload.slice(0, separatorIndex);
      const packageName = payload.slice(separatorIndex + 1);
      if (packageName.length === 0) {
        warnings.push(`Ignoring malformed package line: ${trimmed}`);
        continue;
      }
      packages.push({ packageName, apkPath, rawLine: line });
      continue;
    }

    packages.push({ packageName: payload, rawLine: line });
  }

  return { packages, warnings };
}
