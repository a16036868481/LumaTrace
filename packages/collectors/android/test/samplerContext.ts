import type { AndroidSamplerContext } from "../src/sampling/AndroidSamplerTypes";

export function createSamplerContext(overrides: Partial<AndroidSamplerContext> = {}): AndroidSamplerContext {
  let sequence = 0;
  return {
    sessionId: "android-session-test",
    deviceId: "android:test-device",
    targetId: "android-package:com.example.app",
    serial: "R58M123ABC",
    pid: 12345,
    packageName: "com.example.app",
    processName: "com.example.app",
    sampleIntervalMs: 1,
    nowMs: () => 1_700_000_000_000 + sequence,
    monotonicMs: () => sequence,
    nextSequence: () => ++sequence,
    ...overrides
  };
}
