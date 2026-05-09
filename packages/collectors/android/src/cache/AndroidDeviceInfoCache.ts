import { createHash } from "node:crypto";

export interface AndroidDeviceInfoCacheEntry {
  propsSummary: Record<string, string | number | boolean>;
  name?: string;
  osVersion?: string;
  manufacturer?: string;
  model?: string;
  updatedAt: number;
}

export interface AndroidDeviceInfoCacheStatus {
  key: string;
  updatedAt: number;
  expiresAt: number;
  stale: boolean;
  name?: string;
  osVersion?: string;
}

export interface AndroidDeviceInfoCacheOptions {
  ttlMs?: number;
  nowMs?: () => number;
}

function hashSerial(serial: string): string {
  return createHash("sha256").update(serial).digest("hex").slice(0, 12);
}

export class AndroidDeviceInfoCache {
  private readonly ttlMs: number;
  private readonly nowMs: () => number;
  private readonly entries = new Map<string, AndroidDeviceInfoCacheEntry>();

  constructor(options: AndroidDeviceInfoCacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? 60 * 1000;
    this.nowMs = options.nowMs ?? (() => Date.now());
  }

  get(serial: string): AndroidDeviceInfoCacheEntry | null {
    const key = hashSerial(serial);
    const entry = this.entries.get(key);
    if (entry === undefined) {
      return null;
    }
    if (this.nowMs() - entry.updatedAt > this.ttlMs) {
      this.entries.delete(key);
      return null;
    }
    return {
      ...entry,
      propsSummary: { ...entry.propsSummary }
    };
  }

  set(serial: string, entry: Omit<AndroidDeviceInfoCacheEntry, "updatedAt">): void {
    this.entries.set(hashSerial(serial), {
      ...entry,
      propsSummary: { ...entry.propsSummary },
      updatedAt: this.nowMs()
    });
  }

  invalidate(serial?: string): void {
    if (serial === undefined) {
      this.entries.clear();
      return;
    }
    this.entries.delete(hashSerial(serial));
  }

  status(serial?: string): AndroidDeviceInfoCacheStatus[] {
    const keyFilter = serial === undefined ? undefined : hashSerial(serial);
    return [...this.entries.entries()]
      .filter(([key]) => keyFilter === undefined || key === keyFilter)
      .map(([key, entry]) => {
        const expiresAt = entry.updatedAt + this.ttlMs;
        const status: AndroidDeviceInfoCacheStatus = {
          key,
          updatedAt: entry.updatedAt,
          expiresAt,
          stale: this.nowMs() > expiresAt
        };
        if (entry.name !== undefined) {
          status.name = entry.name;
        }
        if (entry.osVersion !== undefined) {
          status.osVersion = entry.osVersion;
        }
        return status;
      });
  }
}
