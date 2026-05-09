import type { NetworkDelta } from "./parseProcNetDev";

export interface NetstatsUidSnapshot {
  uid: number;
  rxBytes: number;
  txBytes: number;
  rxPackets?: number;
  txPackets?: number;
  identities?: string[];
  bucketCount: number;
  warnings: string[];
}

function parseKeyValue(line: string, key: string): string | undefined {
  const match = new RegExp(`(?:^|\\s)${key}=([^\\s]+)`, "u").exec(line);
  return match?.[1];
}

function parseNumberValue(line: string, key: string): number | null {
  const value = parseKeyValue(line, key);
  if (value === undefined) {
    return null;
  }
  const parsed = Number.parseInt(value.replaceAll(",", ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseNetstatsDetailForUid(output: string, uid: number): NetstatsUidSnapshot | null {
  const warnings: string[] = [];
  const identities = new Set<string>();
  let currentIdentity: string | undefined;
  let rxBytes = 0;
  let txBytes = 0;
  let rxPackets = 0;
  let txPackets = 0;
  let sawRxPackets = false;
  let sawTxPackets = false;
  let bucketCount = 0;

  for (const line of output.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const identityMatch = /^ident=\[(.+)\]/u.exec(trimmed);
    if (identityMatch?.[1] !== undefined) {
      currentIdentity = identityMatch[1];
      continue;
    }

    const parsedUid = parseNumberValue(trimmed, "uid");
    if (parsedUid === null) {
      if (/rxBytes|txBytes/u.test(trimmed)) {
        warnings.push(`Malformed netstats line: ${trimmed}`);
      }
      continue;
    }
    if (parsedUid !== uid) {
      continue;
    }

    const parsedRxBytes = parseNumberValue(trimmed, "rxBytes");
    const parsedTxBytes = parseNumberValue(trimmed, "txBytes");
    if (parsedRxBytes === null || parsedTxBytes === null) {
      warnings.push(`Unable to parse netstats counters for uid ${uid}.`);
      continue;
    }

    rxBytes += parsedRxBytes;
    txBytes += parsedTxBytes;
    const parsedRxPackets = parseNumberValue(trimmed, "rxPackets");
    const parsedTxPackets = parseNumberValue(trimmed, "txPackets");
    if (parsedRxPackets !== null) {
      rxPackets += parsedRxPackets;
      sawRxPackets = true;
    }
    if (parsedTxPackets !== null) {
      txPackets += parsedTxPackets;
      sawTxPackets = true;
    }
    if (currentIdentity !== undefined) {
      identities.add(currentIdentity);
    }
    bucketCount += 1;
  }

  if (bucketCount === 0) {
    return null;
  }

  const snapshot: NetstatsUidSnapshot = {
    uid,
    rxBytes,
    txBytes,
    bucketCount,
    warnings
  };
  if (sawRxPackets) {
    snapshot.rxPackets = rxPackets;
  }
  if (sawTxPackets) {
    snapshot.txPackets = txPackets;
  }
  if (identities.size > 0) {
    snapshot.identities = [...identities];
  }
  return snapshot;
}

export function calculateUidNetworkDelta(
  previous: NetstatsUidSnapshot,
  next: NetstatsUidSnapshot,
  sampleWindowMs: number
): NetworkDelta | null {
  const rxBytes = next.rxBytes - previous.rxBytes;
  const txBytes = next.txBytes - previous.txBytes;
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
