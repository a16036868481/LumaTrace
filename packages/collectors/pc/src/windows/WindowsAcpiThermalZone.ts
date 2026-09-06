const AML_EXT_OP_PREFIX = 0x5b;
const AML_THERMAL_ZONE_OP = 0x85;

interface AmlPackageLength {
  byteCount: number;
  value: number;
}

interface AmlName {
  leaf?: string;
  nextOffset: number;
}

function decodeAmlPackageLength(bytes: Uint8Array, offset: number): AmlPackageLength | undefined {
  const lead = bytes[offset];
  if (lead === undefined) {
    return undefined;
  }
  const followingByteCount = lead >>> 6;
  if (offset + followingByteCount >= bytes.length) {
    return undefined;
  }
  let value = followingByteCount === 0 ? lead & 0x3f : lead & 0x0f;
  for (let index = 0; index < followingByteCount; index += 1) {
    value |= (bytes[offset + index + 1] ?? 0) << (4 + index * 8);
  }
  return { byteCount: followingByteCount + 1, value };
}

function readNameSegment(bytes: Uint8Array, offset: number): string | undefined {
  if (offset + 4 > bytes.length) {
    return undefined;
  }
  const value = String.fromCharCode(...bytes.subarray(offset, offset + 4));
  return /^[A-Z_][A-Z0-9_]{3}$/.test(value) ? value : undefined;
}

function readAmlName(bytes: Uint8Array, offset: number, limit: number): AmlName | undefined {
  let cursor = offset;
  while (cursor < limit && (bytes[cursor] === 0x5c || bytes[cursor] === 0x5e)) {
    cursor += 1;
  }
  const prefix = bytes[cursor];
  if (prefix === undefined || prefix === 0x00) {
    return prefix === 0x00 ? { nextOffset: cursor + 1 } : undefined;
  }

  let segmentCount = 1;
  if (prefix === 0x2e) {
    segmentCount = 2;
    cursor += 1;
  } else if (prefix === 0x2f) {
    segmentCount = bytes[cursor + 1] ?? 0;
    cursor += 2;
  }
  if (segmentCount < 1 || cursor + segmentCount * 4 > limit) {
    return undefined;
  }

  let leaf: string | undefined;
  for (let index = 0; index < segmentCount; index += 1) {
    const segment = readNameSegment(bytes, cursor + index * 4);
    if (segment === undefined) {
      return undefined;
    }
    leaf = segment;
  }
  return leaf === undefined ? undefined : { leaf, nextOffset: cursor + segmentCount * 4 };
}

function asciiInRange(bytes: Uint8Array, start: number, end: number): string {
  let output = "";
  const chunkSize = 8192;
  for (let offset = start; offset < end; offset += chunkSize) {
    output += String.fromCharCode(...bytes.subarray(offset, Math.min(end, offset + chunkSize)));
  }
  return output;
}

function hasProcessorAssociation(bytes: Uint8Array, start: number, end: number): boolean {
  const body = asciiInRange(bytes, start, end);
  if (!body.includes("_PSL")) {
    return false;
  }
  return /(?:PR[0-9A-F]{2}|CPU[0-9A-F]|CP[0-9A-F]{2})/.test(body);
}

export function findProcessorAssociatedThermalZoneNames(
  firmwareTables: readonly Uint8Array[]
): string[] {
  const names = new Set<string>();
  for (const table of firmwareTables) {
    for (let offset = 0; offset + 3 < table.length; offset += 1) {
      if (table[offset] !== AML_EXT_OP_PREFIX || table[offset + 1] !== AML_THERMAL_ZONE_OP) {
        continue;
      }
      const packageLengthOffset = offset + 2;
      const packageLength = decodeAmlPackageLength(table, packageLengthOffset);
      if (packageLength === undefined || packageLength.value <= packageLength.byteCount) {
        continue;
      }
      const packageEnd = packageLengthOffset + packageLength.value;
      const nameOffset = packageLengthOffset + packageLength.byteCount;
      if (packageEnd > table.length || nameOffset >= packageEnd) {
        continue;
      }
      const name = readAmlName(table, nameOffset, packageEnd);
      if (
        name?.leaf !== undefined &&
        hasProcessorAssociation(table, name.nextOffset, packageEnd)
      ) {
        names.add(name.leaf);
      }
      offset = packageEnd - 1;
    }
  }
  return [...names].sort();
}

function thermalZoneLeaf(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const match = /(?:^|[\\.])([A-Z_][A-Z0-9_]{3})$/i.exec(value.trim());
  return match?.[1]?.toUpperCase();
}

export function parseCpuThermalZoneDiscoveryJson(output: string): string[] {
  if (output.trim().length === 0) {
    return [];
  }
  try {
    const parsed = JSON.parse(output) as Record<string, unknown>;
    const instanceValues = Array.isArray(parsed.ThermalZoneInstances)
      ? parsed.ThermalZoneInstances
      : [];
    const availableZones = new Set(
      instanceValues.map(thermalZoneLeaf).filter((value): value is string => value !== undefined)
    );
    const tableValues = Array.isArray(parsed.FirmwareTables) ? parsed.FirmwareTables : [];
    const tables: Uint8Array[] = [];
    let decodedBytes = 0;
    for (const value of tableValues) {
      if (typeof value !== "object" || value === null) {
        continue;
      }
      const data = (value as Record<string, unknown>).Data;
      if (typeof data !== "string" || data.length > 2 * 1024 * 1024) {
        continue;
      }
      const bytes = Buffer.from(data, "base64");
      decodedBytes += bytes.length;
      if (bytes.length === 0 || decodedBytes > 2 * 1024 * 1024) {
        continue;
      }
      tables.push(bytes);
    }
    return findProcessorAssociatedThermalZoneNames(tables).filter((name) => availableZones.has(name));
  } catch {
    return [];
  }
}
