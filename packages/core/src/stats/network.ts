export interface NetworkCounterSample {
  timestampMs: number;
  rxBytes: number;
  txBytes: number;
}

export interface NetworkDelta {
  rxBytes: number;
  txBytes: number;
  rxBytesPerSecond: number;
  txBytesPerSecond: number;
  intervalMs: number;
}

export interface NetworkSummary {
  networkRxMb?: number;
  networkTxMb?: number;
}

export function calculateNetworkDelta(
  previous: NetworkCounterSample,
  current: NetworkCounterSample
): NetworkDelta | undefined {
  const intervalMs = current.timestampMs - previous.timestampMs;
  const rxBytes = current.rxBytes - previous.rxBytes;
  const txBytes = current.txBytes - previous.txBytes;

  if (
    !Number.isFinite(intervalMs) ||
    intervalMs <= 0 ||
    !Number.isFinite(rxBytes) ||
    !Number.isFinite(txBytes) ||
    rxBytes < 0 ||
    txBytes < 0
  ) {
    return undefined;
  }

  const seconds = intervalMs / 1000;
  return {
    rxBytes,
    txBytes,
    rxBytesPerSecond: rxBytes / seconds,
    txBytesPerSecond: txBytes / seconds,
    intervalMs
  };
}

export function bytesToMegabytes(bytes: number): number {
  if (!Number.isFinite(bytes)) {
    return 0;
  }

  return bytes / 1024 / 1024;
}

export function summarizeNetworkDeltas(deltas: readonly NetworkDelta[]): NetworkSummary {
  const rxBytes = deltas.reduce((total, delta) => total + delta.rxBytes, 0);
  const txBytes = deltas.reduce((total, delta) => total + delta.txBytes, 0);
  const summary: NetworkSummary = {};

  if (rxBytes > 0) {
    summary.networkRxMb = bytesToMegabytes(rxBytes);
  }
  if (txBytes > 0) {
    summary.networkTxMb = bytesToMegabytes(txBytes);
  }

  return summary;
}
