import type { IosDeviceInfo } from "../types";

export interface ParseXctraceDevicesResult {
  devices: IosDeviceInfo[];
  warnings: string[];
}

function isIosLikeName(name: string): boolean {
  return /\b(iPhone|iPad|iPod|Apple TV)\b/iu.test(name);
}

function normalizeSection(line: string): "device" | "simulator" | "other" | null {
  const trimmed = line.trim();
  if (/^==\s*Devices\s*==$/iu.test(trimmed)) {
    return "device";
  }
  if (/^==\s*Simulators\s*==$/iu.test(trimmed)) {
    return "simulator";
  }
  if (/^==.*==$/u.test(trimmed)) {
    return "other";
  }
  return null;
}

export function parseXctraceListDevices(output: string): ParseXctraceDevicesResult {
  const devices: IosDeviceInfo[] = [];
  const warnings: string[] = [];
  let section: "device" | "simulator" | "other" | null = null;

  for (const rawLine of output.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line.length === 0) {
      continue;
    }

    const nextSection = normalizeSection(line);
    if (nextSection !== null) {
      section = nextSection;
      continue;
    }

    if (section !== "device" && section !== "simulator") {
      continue;
    }

    const match = /^(.+?)\s+\(([^()]+)\)\s+\(([0-9A-Za-z-]{8,})\)(?:\s+\(([^()]+)\))?$/u.exec(line);
    if (match === null) {
      warnings.push(`Could not parse xctrace device line: ${line}`);
      continue;
    }

    const name = match[1]?.trim() ?? "";
    const osVersion = match[2]?.trim();
    const udid = match[3]?.trim() ?? "";
    const state = match[4]?.trim();
    if (name.length === 0 || udid.length === 0) {
      warnings.push(`Skipped incomplete xctrace device line: ${line}`);
      continue;
    }

    if (!isIosLikeName(name)) {
      warnings.push(`Skipped non-iOS xctrace entry: ${name}`);
      continue;
    }

    devices.push({
      udid,
      name,
      ...(osVersion === undefined ? {} : { osVersion }),
      deviceType: section,
      ...(state === undefined ? {} : { state }),
      rawLine: line
    });
  }

  if (devices.length === 0) {
    warnings.push("No iOS devices or simulators were parsed from xctrace output.");
  }

  return { devices, warnings };
}
