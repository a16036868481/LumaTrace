import type { AdbVersionInfo } from "../types";

export function parseAdbVersion(output: string): AdbVersionInfo {
  const info: AdbVersionInfo = {};
  for (const line of output.split(/\r?\n/u)) {
    const trimmed = line.trim();
    const bridgeMatch = /^Android Debug Bridge version\s+(.+)$/u.exec(trimmed);
    if (bridgeMatch?.[1] !== undefined) {
      info.version = bridgeMatch[1].trim();
      continue;
    }

    const buildMatch = /^Version\s+(.+)$/u.exec(trimmed);
    if (buildMatch?.[1] !== undefined) {
      info.buildVersion = buildMatch[1].trim();
      continue;
    }

    const installedMatch = /^Installed as\s+(.+)$/u.exec(trimmed);
    if (installedMatch?.[1] !== undefined) {
      info.installedAs = installedMatch[1].trim();
    }
  }

  return info;
}
