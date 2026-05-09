export interface NetworkInterfaceStats {
  interfaceName: string;
  rxBytes: number;
  txBytes: number;
  rxPackets?: number;
  txPackets?: number;
  rawLine: string;
}

export interface ProcNetDevSnapshot {
  interfaces: NetworkInterfaceStats[];
  totalRxBytes: number;
  totalTxBytes: number;
  includedInterfaces: string[];
  warnings: string[];
}

export interface ProcNetDevParseOptions {
  excludeLoopback?: boolean;
  includeInterfaces?: string[];
  excludeInterfaces?: string[];
}

export interface NetworkDelta {
  rxBytes: number;
  txBytes: number;
  rxRateBytesPerSecond: number;
  txRateBytesPerSecond: number;
  sampleWindowMs: number;
  warnings: string[];
}

function parseNumber(value: string | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function shouldIncludeInterface(name: string, options: Required<ProcNetDevParseOptions>): boolean {
  if (options.excludeLoopback && name === "lo") {
    return false;
  }
  if (options.includeInterfaces.length > 0 && !options.includeInterfaces.includes(name)) {
    return false;
  }
  if (options.excludeInterfaces.includes(name)) {
    return false;
  }
  return true;
}

export function parseProcNetDev(
  output: string,
  options: ProcNetDevParseOptions = {}
): ProcNetDevSnapshot {
  const normalizedOptions: Required<ProcNetDevParseOptions> = {
    excludeLoopback: options.excludeLoopback ?? true,
    includeInterfaces: options.includeInterfaces ?? [],
    excludeInterfaces: options.excludeInterfaces ?? []
  };
  const warnings: string[] = [];
  const interfaces: NetworkInterfaceStats[] = [];

  for (const line of output.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("Inter-|") || trimmed.startsWith("face |")) {
      continue;
    }

    const match = /^([^:]+):\s*(.+)$/u.exec(trimmed);
    if (match?.[1] === undefined || match[2] === undefined) {
      warnings.push(`Malformed /proc/net/dev line: ${trimmed}`);
      continue;
    }

    const interfaceName = match[1].trim();
    const values = match[2].trim().split(/\s+/u);
    const rxBytes = parseNumber(values[0]);
    const rxPackets = parseNumber(values[1]);
    const txBytes = parseNumber(values[8]);
    const txPackets = parseNumber(values[9]);
    if (rxBytes === null || txBytes === null) {
      warnings.push(`Unable to parse network counters for ${interfaceName}.`);
      continue;
    }

    const item: NetworkInterfaceStats = {
      interfaceName,
      rxBytes,
      txBytes,
      rawLine: trimmed
    };
    if (rxPackets !== null) {
      item.rxPackets = rxPackets;
    }
    if (txPackets !== null) {
      item.txPackets = txPackets;
    }
    interfaces.push(item);
  }

  const included = interfaces.filter((item) => shouldIncludeInterface(item.interfaceName, normalizedOptions));
  return {
    interfaces,
    totalRxBytes: included.reduce((total, item) => total + item.rxBytes, 0),
    totalTxBytes: included.reduce((total, item) => total + item.txBytes, 0),
    includedInterfaces: included.map((item) => item.interfaceName),
    warnings
  };
}

export function calculateDeviceNetworkDelta(
  previous: ProcNetDevSnapshot,
  next: ProcNetDevSnapshot,
  sampleWindowMs: number
): NetworkDelta | null {
  const rxBytes = next.totalRxBytes - previous.totalRxBytes;
  const txBytes = next.totalTxBytes - previous.totalTxBytes;
  if (!Number.isFinite(sampleWindowMs) || sampleWindowMs <= 0 || rxBytes < 0 || txBytes < 0) {
    return null;
  }

  const seconds = sampleWindowMs / 1000;
  return {
    rxBytes,
    txBytes,
    rxRateBytesPerSecond: rxBytes / seconds,
    txRateBytesPerSecond: txBytes / seconds,
    sampleWindowMs,
    warnings: [...previous.warnings, ...next.warnings]
  };
}
