import { METRIC_NAMES, METRIC_UNITS, type MetricEvent, type MetricPrecision, type Tags } from "@lumatrace/core";
import {
  calculateUidNetworkDelta,
  type NetstatsUidSnapshot
} from "../parsers/parseNetstatsDetail";
import {
  calculateDeviceNetworkDelta,
  type NetworkDelta,
  type ProcNetDevSnapshot
} from "../parsers/parseProcNetDev";
import type { AndroidAdbClientLike } from "../types";
import { createAndroidMetricEvent, type AndroidSamplerContext } from "./AndroidSamplerTypes";

export interface AndroidNetworkSamplerOptions {
  adbClient: AndroidAdbClientLike;
  context: AndroidSamplerContext;
  uid?: number;
  preferUidStats?: boolean;
  fallbackToDeviceLevel?: boolean;
}

type NetworkMode = "uid" | "device";

export class AndroidNetworkSampler {
  private readonly adbClient: AndroidAdbClientLike;
  private readonly context: AndroidSamplerContext;
  private readonly preferUidStats: boolean;
  private readonly fallbackToDeviceLevel: boolean;
  private uid: number | null | undefined;
  private previousUidSnapshot: NetstatsUidSnapshot | null = null;
  private previousDeviceSnapshot: ProcNetDevSnapshot | null = null;
  private activeMode: NetworkMode | undefined;

  constructor(options: AndroidNetworkSamplerOptions) {
    this.adbClient = options.adbClient;
    this.context = options.context;
    this.uid = options.uid;
    this.preferUidStats = options.preferUidStats ?? true;
    this.fallbackToDeviceLevel = options.fallbackToDeviceLevel ?? true;
  }

  async sample(): Promise<MetricEvent[]> {
    if (this.preferUidStats) {
      const uidEvents = await this.sampleUidMode();
      if (uidEvents !== null) {
        return uidEvents;
      }
    }

    if (!this.fallbackToDeviceLevel) {
      return [];
    }
    return this.sampleDeviceMode("UID-level network stats unavailable");
  }

  private async resolveUid(): Promise<number | null> {
    if (this.uid !== undefined) {
      return this.uid;
    }
    try {
      this.uid = await this.adbClient.getPackageUid(this.context.serial, this.context.packageName);
    } catch {
      this.uid = null;
    }
    return this.uid;
  }

  private async sampleUidMode(): Promise<MetricEvent[] | null> {
    const uid = await this.resolveUid();
    if (uid === null) {
      return null;
    }

    let snapshot: NetstatsUidSnapshot | null;
    try {
      snapshot = await this.adbClient.readUidNetworkStats(this.context.serial, uid);
    } catch {
      return null;
    }
    if (snapshot === null) {
      return null;
    }

    const previous = this.previousUidSnapshot;
    this.previousUidSnapshot = snapshot;
    this.activeMode = "uid";
    if (previous === null) {
      return [];
    }

    const delta = calculateUidNetworkDelta(previous, snapshot, this.context.sampleIntervalMs);
    if (delta === null) {
      return [];
    }

    return this.eventsForDelta(delta, {
      mode: "uid",
      source: "adb:dumpsys netstats detail",
      precision: "estimated",
      confidence: "medium",
      tags: {
        scope: "app_uid",
        uid,
        bucketCount: snapshot.bucketCount,
        identities: snapshot.identities?.join(",") ?? "",
        sourceCommand: "dumpsys netstats detail",
        rxTotalBytesBefore: previous.rxBytes,
        rxTotalBytesAfter: snapshot.rxBytes,
        txTotalBytesBefore: previous.txBytes,
        txTotalBytesAfter: snapshot.txBytes
      }
    });
  }

  private async sampleDeviceMode(fallbackReason: string): Promise<MetricEvent[]> {
    let snapshot: ProcNetDevSnapshot;
    try {
      snapshot = await this.adbClient.readProcNetDev(this.context.serial);
    } catch {
      return [];
    }

    const previous = this.previousDeviceSnapshot;
    this.previousDeviceSnapshot = snapshot;
    this.activeMode = "device";
    if (previous === null) {
      return [];
    }

    const delta = calculateDeviceNetworkDelta(previous, snapshot, this.context.sampleIntervalMs);
    if (delta === null) {
      return [];
    }

    return this.eventsForDelta(delta, {
      mode: "device",
      source: "adb:/proc/net/dev",
      precision: "device_level",
      confidence: "low",
      tags: {
        scope: "device",
        interfaces: snapshot.includedInterfaces.join(","),
        sourceCommand: "cat /proc/net/dev",
        fallbackReason,
        rxTotalBytesBefore: previous.totalRxBytes,
        rxTotalBytesAfter: snapshot.totalRxBytes,
        txTotalBytesBefore: previous.totalTxBytes,
        txTotalBytesAfter: snapshot.totalTxBytes
      }
    });
  }

  private eventsForDelta(
    delta: NetworkDelta,
    options: {
      mode: NetworkMode;
      source: string;
      precision: MetricPrecision;
      confidence: "medium" | "low";
      tags: Tags;
    }
  ): MetricEvent[] {
    const timestampMs = this.context.nowMs();
    const monotonicMs = this.context.monotonicMs();
    const commonTags: Tags = {
      sampler: "network",
      mode: options.mode,
      activeMode: this.activeMode ?? options.mode,
      sampleWindowMs: delta.sampleWindowMs,
      intervalMs: delta.sampleWindowMs,
      parserVersion: options.mode === "uid" ? "android-netstats-detail-v1" : "android-proc-net-dev-v1",
      ...options.tags
    };
    if (delta.warnings.length > 0) {
      commonTags.warningCount = delta.warnings.length;
    }

    return [
      createAndroidMetricEvent({
        context: this.context,
        metricName: METRIC_NAMES.NETWORK_RX_BYTES,
        value: delta.rxBytes,
        unit: METRIC_UNITS.BYTES,
        source: options.source,
        precision: options.precision,
        confidence: options.confidence,
        parserVersion: commonTags.parserVersion as string,
        timestampMs,
        monotonicMs,
        tags: commonTags
      }),
      createAndroidMetricEvent({
        context: this.context,
        metricName: METRIC_NAMES.NETWORK_TX_BYTES,
        value: delta.txBytes,
        unit: METRIC_UNITS.BYTES,
        source: options.source,
        precision: options.precision,
        confidence: options.confidence,
        parserVersion: commonTags.parserVersion as string,
        timestampMs,
        monotonicMs,
        tags: commonTags
      }),
      createAndroidMetricEvent({
        context: this.context,
        metricName: METRIC_NAMES.NETWORK_RX_RATE_BPS,
        value: delta.rxRateBytesPerSecond,
        unit: METRIC_UNITS.BYTES_PER_SECOND,
        source: options.source,
        precision: options.precision,
        confidence: options.confidence,
        parserVersion: commonTags.parserVersion as string,
        timestampMs,
        monotonicMs,
        tags: commonTags
      }),
      createAndroidMetricEvent({
        context: this.context,
        metricName: METRIC_NAMES.NETWORK_TX_RATE_BPS,
        value: delta.txRateBytesPerSecond,
        unit: METRIC_UNITS.BYTES_PER_SECOND,
        source: options.source,
        precision: options.precision,
        confidence: options.confidence,
        parserVersion: commonTags.parserVersion as string,
        timestampMs,
        monotonicMs,
        tags: commonTags
      })
    ];
  }
}
