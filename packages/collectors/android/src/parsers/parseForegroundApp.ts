import type { MetricConfidence } from "@lumatrace/core";

export type AndroidForegroundAppSource =
  | "activity_top"
  | "top_resumed_activity"
  | "resumed_activity"
  | "focused_app"
  | "current_focus"
  | "activity_component"
  | "unknown";

export interface AndroidForegroundAppResult {
  packageName?: string;
  activityName?: string;
  componentName?: string;
  source: AndroidForegroundAppSource;
  confidence: MetricConfidence;
  warnings: string[];
  rawLine?: string;
}

const COMPONENT_PATTERN = /([A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+)\/([A-Za-z0-9_.$]+|\.[A-Za-z0-9_.$]+)/u;
const IGNORED_PACKAGES = new Set([
  "android",
  "com.android.systemui",
  "com.google.android.apps.nexuslauncher",
  "com.miui.home"
]);

function normalizeComponent(packageName: string, activityName: string): string {
  return `${packageName}/${activityName}`;
}

function resultFromLine(
  line: string,
  source: AndroidForegroundAppSource,
  confidence: MetricConfidence
): AndroidForegroundAppResult | null {
  const match = COMPONENT_PATTERN.exec(line);
  if (match === null) {
    return null;
  }
  const packageName = match[1]!;
  if (IGNORED_PACKAGES.has(packageName)) {
    return null;
  }
  const activityName = match[2]!;
  return {
    packageName,
    activityName,
    componentName: normalizeComponent(packageName, activityName),
    source,
    confidence,
    warnings: [],
    rawLine: line.trim()
  };
}

export function parseForegroundApp(output: string): AndroidForegroundAppResult {
  const warnings: string[] = [];
  const lines = output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return {
      source: "unknown",
      confidence: "low",
      warnings: ["foreground app output was empty."]
    };
  }

  const preferredPatterns: Array<{
    source: AndroidForegroundAppSource;
    confidence: MetricConfidence;
    test: (line: string) => boolean;
  }> = [
    {
      source: "top_resumed_activity",
      confidence: "high",
      test: (line) => line.includes("topResumedActivity")
    },
    {
      source: "resumed_activity",
      confidence: "high",
      test: (line) =>
        line.includes("mResumedActivity") ||
        line.includes("ResumedActivity") ||
        line.startsWith("Resumed:")
    },
    {
      source: "focused_app",
      confidence: "medium",
      test: (line) => line.includes("mFocusedApp")
    },
    {
      source: "current_focus",
      confidence: "medium",
      test: (line) => line.includes("mCurrentFocus")
    },
    {
      source: "activity_component",
      confidence: "medium",
      test: (line) => line.includes("mActivityComponent=")
    },
    {
      source: "activity_component",
      confidence: "medium",
      test: (line) => line.includes("cmp=")
    },
    {
      source: "activity_top",
      confidence: "medium",
      test: (line) => line.startsWith("ACTIVITY ")
    }
  ];

  for (const pattern of preferredPatterns) {
    const matchingLines = lines.filter(pattern.test);
    for (const line of matchingLines) {
      const parsed = resultFromLine(line, pattern.source, pattern.confidence);
      if (parsed !== null) {
        return parsed;
      }
    }
  }

  const fallback = lines
    .map((line) => resultFromLine(line, "unknown", "low"))
    .find((parsed): parsed is AndroidForegroundAppResult => parsed !== null);
  if (fallback !== undefined) {
    fallback.warnings.push("foreground app was inferred from a generic component line.");
    return fallback;
  }

  warnings.push("No foreground Android app package could be parsed.");
  return {
    source: "unknown",
    confidence: "low",
    warnings
  };
}
