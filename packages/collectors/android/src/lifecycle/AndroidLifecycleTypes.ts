import type { MetricConfidence } from "@lumatrace/core";

export interface AndroidLauncherActivity {
  packageName: string;
  activityName: string;
  componentName: string;
  exported?: boolean;
  enabled?: boolean;
  matchSource: "main_launcher" | "resolver" | "unknown";
  confidence: MetricConfidence;
  rawLine?: string;
}

export interface ParseLauncherActivitiesResult {
  packageName: string;
  activities: AndroidLauncherActivity[];
  warnings: string[];
}

export interface AndroidStartActivityResult {
  ok: boolean;
  status?: string;
  activity?: string;
  thisTimeMs?: number;
  totalTimeMs?: number;
  waitTimeMs?: number;
  warnings: string[];
  rawOutput: string;
}

export interface AndroidMonkeyLaunchResult {
  ok: boolean;
  eventsSent?: number;
  packageName?: string;
  warnings: string[];
  rawOutput: string;
}

export interface AndroidForceStopResult {
  ok: boolean;
  method: "am_force_stop";
  durationMs: number;
  warnings: string[];
  rawOutput: string;
}

export interface AndroidPidWaitResult {
  found: boolean;
  pid?: number;
  attempts: number;
  durationMs: number;
  reason?: string;
}

export interface AndroidAppStartOptions {
  launcherComponent?: string;
  allowMonkeyFallback?: boolean;
  waitForPid?: boolean;
  waitTimeoutMs?: number;
  pollIntervalMs?: number;
}

export interface AndroidAppStartResult {
  ok: boolean;
  method: "am_start" | "monkey" | "none";
  launcherComponent?: string;
  pid?: number;
  startActivityResult?: AndroidStartActivityResult;
  monkeyResult?: AndroidMonkeyLaunchResult;
  durationMs: number;
  warnings: string[];
  diagnostics: string[];
}

export interface AndroidAppStopOptions {
  force?: boolean;
  waitUntilStopped?: boolean;
  waitTimeoutMs?: number;
  pollIntervalMs?: number;
}

export interface AndroidAppStopResult {
  ok: boolean;
  method: "am_force_stop";
  durationMs: number;
  stopped?: boolean;
  warnings: string[];
  diagnostics: string[];
  forceStopResult?: AndroidForceStopResult;
}

export type AndroidProcessMissingPolicy =
  | "fail_session"
  | "pause_process_metrics_keep_device_metrics"
  | "wait_for_rebind";

export interface AndroidProcessState {
  status: "running" | "missing" | "rebound" | "stopped";
  pid?: number;
  previousPid?: number;
  reason?: string;
  timestampMs: number;
}
