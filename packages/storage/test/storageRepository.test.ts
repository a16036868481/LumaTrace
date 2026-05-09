import { describe, expect, it } from "vitest";
import type { Device, EventMarker, Session, Target } from "@lumatrace/core";
import {
  DeviceRepository,
  DiagnosticRepository,
  MarkerRepository,
  LumaTraceDatabase,
  ReportRepository,
  SessionRepository,
  TargetRepository,
  ToolStatusRepository
} from "../src";

function createDatabase(): LumaTraceDatabase {
  return new LumaTraceDatabase({ dbPath: ":memory:" });
}

function createDevice(): Device {
  return {
    id: "device-1",
    platform: "windows",
    name: "Storage Test Device",
    osVersion: "Mock OS",
    connectionType: "local",
    capabilities: [
      {
        metricName: "fps",
        platform: "windows",
        status: "available",
        source: "mock",
        reason: "test"
      }
    ],
    tags: {
      source: "test"
    }
  };
}

function createTarget(): Target {
  return {
    id: "target-1",
    name: "Storage Target",
    type: "app",
    platform: "windows",
    pid: 1234,
    executablePath: "C:\\LumaTrace\\StorageTarget.exe",
    tags: {
      source: "test"
    }
  };
}

function createSession(): Session {
  return {
    id: "session-1",
    name: "Storage Session",
    deviceId: "device-1",
    targetId: "target-1",
    startedAt: 1000,
    sampleIntervalMs: 1000,
    status: "running",
    notes: ["started"],
    config: {
      profileName: "storage"
    }
  };
}

function insertDeviceTargetSession(database: LumaTraceDatabase): void {
  new DeviceRepository(database).upsert(createDevice());
  new TargetRepository(database).upsert("device-1", createTarget());
  new SessionRepository(database).create(createSession());
}

describe("storage repositories", () => {
  it("upserts, reads, lists, and deletes devices", () => {
    const database = createDatabase();
    const devices = new DeviceRepository(database);

    try {
      const device = createDevice();
      devices.upsert(device);
      devices.upsert({ ...device, name: "Updated Device" });

      expect(devices.getById("device-1")?.name).toBe("Updated Device");
      expect(devices.list()).toHaveLength(1);

      devices.delete("device-1");
      expect(devices.getById("device-1")).toBeNull();
    } finally {
      database.close();
    }
  });

  it("upserts and lists targets by device without changing the core Target shape", () => {
    const database = createDatabase();
    const devices = new DeviceRepository(database);
    const targets = new TargetRepository(database);

    try {
      devices.upsert(createDevice());
      targets.upsert("device-1", createTarget());

      const listed = targets.listByDevice("device-1");
      expect(listed).toHaveLength(1);
      expect(listed[0]?.id).toBe("target-1");
      expect("deviceId" in (listed[0] ?? {})).toBe(false);
    } finally {
      database.close();
    }
  });

  it("creates, reads, lists, and updates sessions", () => {
    const database = createDatabase();
    insertDeviceTargetSession(database);
    const sessions = new SessionRepository(database);

    try {
      expect(sessions.getById("session-1")?.notes).toEqual(["started"]);
      expect(sessions.list()).toHaveLength(1);
      expect(sessions.listByDevice("device-1")).toHaveLength(1);

      sessions.updateStatus("session-1", "stopped", { endedAt: 2000 });
      const stopped = sessions.getById("session-1");
      expect(stopped?.status).toBe("stopped");
      expect(stopped?.endedAt).toBe(2000);
    } finally {
      database.close();
    }
  });

  it("creates and lists markers", () => {
    const database = createDatabase();
    insertDeviceTargetSession(database);
    const markers = new MarkerRepository(database);

    try {
      const marker: EventMarker = {
        id: "marker-1",
        sessionId: "session-1",
        timestampMs: 1500,
        label: "Boss Fight",
        description: "test marker",
        tags: {
          phase: "combat"
        }
      };
      markers.create(marker);

      expect(markers.getById("marker-1")?.tags).toEqual({ phase: "combat" });
      expect(markers.listBySession("session-1")).toHaveLength(1);
    } finally {
      database.close();
    }
  });

  it("saves and reads report cache records", () => {
    const database = createDatabase();
    insertDeviceTargetSession(database);
    const reports = new ReportRepository(database);

    try {
      reports.save(
        "session-1",
        { durationMs: 1000, avgFps: 58 },
        { htmlPath: "report.html", jsonPath: "report.json", csvPath: "report.csv" },
        "v-test"
      );

      const report = reports.get("session-1");
      expect(report?.summary.avgFps).toBe(58);
      expect(report?.htmlPath).toBe("report.html");
      expect(report?.version).toBe("v-test");
    } finally {
      database.close();
    }
  });

  it("upserts and lists tool status records", () => {
    const database = createDatabase();
    const tools = new ToolStatusRepository(database);

    try {
      tools.upsert({
        toolName: "adb",
        status: "missing",
        reason: "not installed",
        suggestedAction: "install adb"
      });
      tools.upsert({
        toolName: "adb",
        status: "available",
        version: "1.0.41"
      });

      expect(tools.get("adb")?.status).toBe("available");
      expect(tools.list()).toHaveLength(1);
    } finally {
      database.close();
    }
  });

  it("creates and lists diagnostics", () => {
    const database = createDatabase();
    const diagnostics = new DiagnosticRepository(database);

    try {
      diagnostics.create({
        id: "diag-1",
        timestampMs: 1000,
        level: "warn",
        category: "storage",
        message: "diagnostic test",
        details: {
          table: "sessions"
        },
        sessionId: "session-1",
        deviceId: "device-1"
      });

      expect(diagnostics.getById("diag-1")?.details).toEqual({ table: "sessions" });
      expect(diagnostics.list({ sessionId: "session-1" })).toHaveLength(1);
      expect(diagnostics.list({ level: "error" })).toHaveLength(0);
    } finally {
      database.close();
    }
  });

  it("cascades target and session deletion when a device is deleted", () => {
    const database = createDatabase();
    insertDeviceTargetSession(database);
    const devices = new DeviceRepository(database);
    const targets = new TargetRepository(database);
    const sessions = new SessionRepository(database);

    try {
      devices.delete("device-1");

      expect(targets.getById("target-1")).toBeNull();
      expect(sessions.getById("session-1")).toBeNull();
    } finally {
      database.close();
    }
  });
});
