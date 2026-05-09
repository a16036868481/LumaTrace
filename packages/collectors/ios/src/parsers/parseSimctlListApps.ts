import type { IosAppInfo } from "../types";

export interface ParseSimctlListAppsResult {
  apps: IosAppInfo[];
  warnings: string[];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function parseSimctlListApps(output: string): ParseSimctlListAppsResult {
  const warnings: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return {
      apps: [],
      warnings: ["simctl listapps output was not valid JSON."]
    };
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      apps: [],
      warnings: ["simctl listapps output did not contain an app dictionary."]
    };
  }

  const apps: IosAppInfo[] = [];
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      warnings.push(`Skipped malformed simctl app entry: ${key}`);
      continue;
    }
    const record = value as Record<string, unknown>;
    const bundleId = stringValue(record.CFBundleIdentifier) ?? key;
    if (!/^[A-Za-z0-9][A-Za-z0-9.-]+$/u.test(bundleId)) {
      warnings.push(`Skipped app with invalid bundle identifier: ${bundleId}`);
      continue;
    }
    const applicationType = stringValue(record.ApplicationType);
    if (applicationType === "System") {
      continue;
    }
    const name = stringValue(record.CFBundleName);
    const displayName = stringValue(record.CFBundleDisplayName);
    apps.push({
      bundleId,
      ...(name === undefined ? {} : { name }),
      ...(displayName === undefined ? {} : { displayName }),
      ...(applicationType === undefined ? {} : { applicationType }),
      raw: {
        ApplicationType: applicationType ?? "unknown",
        CFBundleIdentifier: bundleId,
        CFBundleName: name ?? "",
        CFBundleDisplayName: displayName ?? ""
      }
    });
  }

  if (apps.length === 0) {
    warnings.push("No user simulator apps were parsed from simctl output.");
  }

  return { apps, warnings };
}
