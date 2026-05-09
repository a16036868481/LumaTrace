import { describe, expect, it } from "vitest";
import { AndroidDeviceInfoCache, AndroidLauncherCache } from "../src";

const launcher = {
  packageName: "com.example.app",
  activityName: ".MainActivity",
  componentName: "com.example.app/.MainActivity",
  matchSource: "main_launcher" as const,
  confidence: "high" as const
};

describe("Android launcher and device info caches", () => {
  it("handles launcher hit, miss, ttl, invalidate, and no full serial in status", () => {
    let now = 1000;
    const cache = new AndroidLauncherCache({ ttlMs: 100, nowMs: () => now });

    expect(cache.get("ZX1G22ABCDEF", "com.example.app")).toBeNull();
    cache.set("ZX1G22ABCDEF", "com.example.app", {
      launcherActivities: [launcher],
      hasLauncher: true,
      warnings: []
    });
    expect(cache.get("ZX1G22ABCDEF", "com.example.app")?.hasLauncher).toBe(true);
    expect(JSON.stringify(cache.status("ZX1G22ABCDEF"))).not.toContain("ZX1G22ABCDEF");

    now = 1200;
    expect(cache.get("ZX1G22ABCDEF", "com.example.app")).toBeNull();

    cache.set("ZX1G22ABCDEF", "com.example.app", {
      launcherActivities: [launcher],
      hasLauncher: true,
      warnings: []
    });
    cache.invalidate("ZX1G22ABCDEF", "com.example.app");
    expect(cache.get("ZX1G22ABCDEF", "com.example.app")).toBeNull();
  });

  it("handles device info refresh without storing full serial in status", () => {
    const cache = new AndroidDeviceInfoCache({ ttlMs: 1000, nowMs: () => 10 });
    cache.set("ZX1G22ABCDEF", {
      propsSummary: { model: "Pixel" },
      name: "Pixel",
      osVersion: "Android 14"
    });

    expect(cache.get("ZX1G22ABCDEF")?.name).toBe("Pixel");
    expect(JSON.stringify(cache.status("ZX1G22ABCDEF"))).not.toContain("ZX1G22ABCDEF");
    cache.invalidate("ZX1G22ABCDEF");
    expect(cache.get("ZX1G22ABCDEF")).toBeNull();
  });
});
