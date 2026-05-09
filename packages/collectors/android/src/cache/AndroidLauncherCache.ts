import { createHash } from "node:crypto";
import type { AndroidLauncherActivity } from "../lifecycle/AndroidLifecycleTypes";

export interface AndroidLauncherCacheEntry {
  launcherActivities: AndroidLauncherActivity[];
  hasLauncher: boolean;
  warnings: string[];
  updatedAt: number;
}

export interface AndroidLauncherCacheStatus {
  key: string;
  packageName: string;
  updatedAt: number;
  expiresAt: number;
  stale: boolean;
  hasLauncher: boolean;
  launcherCount: number;
}

export interface AndroidLauncherCacheOptions {
  ttlMs?: number;
  nowMs?: () => number;
}

function hashSerial(serial: string): string {
  return createHash("sha256").update(serial).digest("hex").slice(0, 12);
}

function cacheKey(serial: string, packageName: string): string {
  return `${hashSerial(serial)}:${packageName}`;
}

export class AndroidLauncherCache {
  private readonly ttlMs: number;
  private readonly nowMs: () => number;
  private readonly entries = new Map<string, AndroidLauncherCacheEntry>();

  constructor(options: AndroidLauncherCacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? 5 * 60 * 1000;
    this.nowMs = options.nowMs ?? (() => Date.now());
  }

  get(serial: string, packageName: string): AndroidLauncherCacheEntry | null {
    const key = cacheKey(serial, packageName);
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
      launcherActivities: entry.launcherActivities.map((activity) => ({ ...activity })),
      warnings: [...entry.warnings]
    };
  }

  set(serial: string, packageName: string, entry: Omit<AndroidLauncherCacheEntry, "updatedAt">): void {
    this.entries.set(cacheKey(serial, packageName), {
      ...entry,
      launcherActivities: entry.launcherActivities.map((activity) => ({ ...activity })),
      warnings: [...entry.warnings],
      updatedAt: this.nowMs()
    });
  }

  invalidate(serial: string, packageName?: string): void {
    if (packageName !== undefined) {
      this.entries.delete(cacheKey(serial, packageName));
      return;
    }
    const prefix = `${hashSerial(serial)}:`;
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
      }
    }
  }

  clear(): void {
    this.entries.clear();
  }

  status(serial?: string): AndroidLauncherCacheStatus[] {
    const prefix = serial === undefined ? undefined : `${hashSerial(serial)}:`;
    return [...this.entries.entries()]
      .filter(([key]) => prefix === undefined || key.startsWith(prefix))
      .map(([key, entry]) => {
        const packageName = key.slice(key.indexOf(":") + 1);
        const expiresAt = entry.updatedAt + this.ttlMs;
        return {
          key,
          packageName,
          updatedAt: entry.updatedAt,
          expiresAt,
          stale: this.nowMs() > expiresAt,
          hasLauncher: entry.hasLauncher,
          launcherCount: entry.launcherActivities.length
        };
      });
  }
}
