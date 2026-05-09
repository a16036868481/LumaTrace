import { describe, expect, it } from "vitest";
import { MockCollector } from "@lumatrace/collectors-mock";
import type {
  Device,
  MetricAvailability,
  MetricEvent,
  MetricCollector,
  Platform,
  Session,
  Target
} from "@lumatrace/core";
import {
  DeviceRepository,
  DiagnosticRepository,
  MetricRepository,
  LumaTraceDatabase,
  SessionRepository,
  TargetRepository
} from "@lumatrace/storage";
import { MetricRingBuffer } from "../src/runtime/MetricRingBuffer";
import { SessionRuntime } from "../src/runtime/SessionRuntime";
import { DiagnosticService } from "../src/services/DiagnosticService";

async function waitUntil(assertion: () => boolean, timeoutMs = 800): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (assertion()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for assertion.");
}

async function setup() {
  const database = new LumaTraceDatabase({ dbPath: ":memory:" });
  const collector = new MockCollector({ seed: "runtime-test" });
  const [device] = await collector.discoverDevices();
  if (device === undefined) {
    throw new Error("Mock device missing.");
  }
  const [target] = await collector.listTargets(device.id);
  if (target === undefined) {
    throw new Error("Mock target missing.");
  }

  new DeviceRepository(database).upsert(device);
  new TargetRepository(database).upsert(device.id, target);
  const session: Session = {
    id: "runtime-session",
    name: "Runtime Session",
    deviceId: device.id,
    targetId: target.id,
    sampleIntervalMs: 1,
    status: "created",
    config: {
      profileName: "stable_60fps"
    }
  };
  const sessionRepository = new SessionRepository(database);
  sessionRepository.create(session);
  return {
    database,
    collector,
    session,
    sessionRepository,
    metricRepository: new MetricRepository(database),
    diagnosticRepository: new DiagnosticRepository(database),
    ringBuffer: new MetricRingBuffer(100)
  };
}

describe("SessionRuntime", () => {
  it("collects metrics without websocket clients and flushes on stop", async () => {
    const setupResult = await setup();
    const diagnosticService = new DiagnosticService(setupResult.diagnosticRepository);
    const runtime = new SessionRuntime({
      session: setupResult.session,
      collector: setupResult.collector,
      metricRepository: setupResult.metricRepository,
      sessionRepository: setupResult.sessionRepository,
      diagnosticService,
      ringBuffer: setupResult.ringBuffer,
      batchSize: 4,
      flushIntervalMs: 1000
    });

    try {
      await runtime.start();
      await waitUntil(() => setupResult.metricRepository.countRaw("runtime-session") >= 4);

      expect(setupResult.ringBuffer.size("runtime-session")).toBeGreaterThan(0);
      expect(setupResult.metricRepository.countRaw("runtime-session")).toBeGreaterThanOrEqual(4);

      await runtime.stop();
      const countAfterStop = setupResult.metricRepository.countRaw("runtime-session");
      expect(countAfterStop).toBeGreaterThanOrEqual(4);
      expect(runtime.getStatus()).toBe("stopped");

      await runtime.stop();
      expect(setupResult.metricRepository.countRaw("runtime-session")).toBe(countAfterStop);
    } finally {
      setupResult.database.close();
    }
  });

  it("writes diagnostics when collection fails", async () => {
    const database = new LumaTraceDatabase({ dbPath: ":memory:" });
    const sessionRepository = new SessionRepository(database);
    const metricRepository = new MetricRepository(database);
    const diagnosticRepository = new DiagnosticRepository(database);
    const diagnosticService = new DiagnosticService(diagnosticRepository);
    const device: Device = {
      id: "bad-device",
      platform: "windows",
      name: "Bad Device",
      connectionType: "local",
      capabilities: []
    };
    const target: Target = {
      id: "bad-target",
      name: "Bad Target",
      type: "app",
      platform: "windows"
    };
    new DeviceRepository(database).upsert(device);
    new TargetRepository(database).upsert(device.id, target);
    const session: Session = {
      id: "bad-session",
      name: "Bad Session",
      deviceId: device.id,
      targetId: target.id,
      sampleIntervalMs: 1,
      status: "created"
    };
    sessionRepository.create(session);

    const badCollector: MetricCollector = {
      id: "bad",
      platform: "windows" as Platform,
      discoverDevices: async () => [device],
      listTargets: async () => [target],
      getCapabilities: async (): Promise<MetricAvailability[]> => [],
      startSession: async () => ({ ...session, status: "running", startedAt: Date.now() }),
      pauseSession: async () => undefined,
      stopSession: async () => undefined,
      streamMetrics: () => ({
        [Symbol.asyncIterator](): AsyncIterator<MetricEvent> {
          return {
            next: async () => {
              throw new Error("collector exploded");
            }
          };
        }
      })
    };
    const runtime = new SessionRuntime({
      session,
      collector: badCollector,
      metricRepository,
      sessionRepository,
      diagnosticService,
      ringBuffer: new MetricRingBuffer(10),
      batchSize: 1
    });

    try {
      await runtime.start();
      await waitUntil(() => diagnosticRepository.list({ level: "error" }).length > 0);
      expect(sessionRepository.getById("bad-session")?.status).toBe("failed");
    } finally {
      await runtime.stop();
      database.close();
    }
  });

  it("persists final metric events emitted during collector stop", async () => {
    const database = new LumaTraceDatabase({ dbPath: ":memory:" });
    const sessionRepository = new SessionRepository(database);
    const metricRepository = new MetricRepository(database);
    const diagnosticRepository = new DiagnosticRepository(database);
    const diagnosticService = new DiagnosticService(diagnosticRepository);
    const device: Device = {
      id: "android-device",
      platform: "android",
      name: "Android Device",
      connectionType: "usb",
      capabilities: []
    };
    const target: Target = {
      id: "android-target",
      name: "Android Target",
      type: "app",
      platform: "android"
    };
    new DeviceRepository(database).upsert(device);
    new TargetRepository(database).upsert(device.id, target);
    const session: Session = {
      id: "final-metrics-session",
      name: "Final Metrics Session",
      deviceId: device.id,
      targetId: target.id,
      sampleIntervalMs: 1,
      status: "created"
    };
    sessionRepository.create(session);

    const finalMetric: MetricEvent = {
      sessionId: session.id,
      timestampMs: Date.now(),
      deviceId: device.id,
      targetId: target.id,
      metricName: "fps",
      value: 58.5,
      unit: "fps",
      source: "adb:dumpsys gfxinfo framestats",
      precision: "estimated",
      confidence: "medium",
      tags: {
        experimental: true
      }
    };
    let stopped = false;
    const finalCollector: MetricCollector & { drainFinalMetrics(sessionId: string): MetricEvent[] } = {
      id: "android-final",
      platform: "android",
      discoverDevices: async () => [device],
      listTargets: async () => [target],
      getCapabilities: async (): Promise<MetricAvailability[]> => [],
      startSession: async () => ({ ...session, status: "running", startedAt: Date.now() }),
      pauseSession: async () => undefined,
      stopSession: async () => {
        stopped = true;
      },
      streamMetrics: () => ({
        [Symbol.asyncIterator](): AsyncIterator<MetricEvent> {
          return {
            next: async () => {
              while (!stopped) {
                await new Promise((resolve) => setTimeout(resolve, 5));
              }
              return { done: true, value: undefined };
            }
          };
        }
      }),
      drainFinalMetrics: () => [finalMetric]
    };
    const runtime = new SessionRuntime({
      session,
      collector: finalCollector,
      metricRepository,
      sessionRepository,
      diagnosticService,
      ringBuffer: new MetricRingBuffer(10),
      batchSize: 1
    });

    try {
      await runtime.start();
      await runtime.stop();

      expect(metricRepository.queryRaw({ sessionId: session.id })).toEqual(
        expect.arrayContaining([expect.objectContaining({ metricName: "fps", value: 58.5 })])
      );
      expect(runtime.getStatus()).toBe("stopped");
    } finally {
      database.close();
    }
  });
});
