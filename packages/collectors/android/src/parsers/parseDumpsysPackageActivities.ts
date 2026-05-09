import type {
  AndroidLauncherActivity,
  ParseLauncherActivitiesResult
} from "../lifecycle/AndroidLifecycleTypes";

const COMPONENT_PATTERN = /([A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+)\/(\.[A-Za-z0-9_$]+|[A-Za-z][A-Za-z0-9_.$]+)/u;

function normalizeActivityName(packageName: string, activityName: string): string {
  return activityName.startsWith(".") ? `${packageName}${activityName}` : activityName;
}

function parseBoolean(line: string, key: string): boolean | undefined {
  const match = new RegExp(`${key}\\s*=\\s*(true|false)`, "iu").exec(line);
  return match?.[1] === undefined ? undefined : match[1].toLowerCase() === "true";
}

function inferPackageName(output: string, fallback = "unknown"): string {
  return (
    /Package\s+\[([^\]]+)\]/iu.exec(output)?.[1] ??
    /pkg=([A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+)/iu.exec(output)?.[1] ??
    COMPONENT_PATTERN.exec(output)?.[1] ??
    fallback
  );
}

export function parseDumpsysPackageActivities(
  output: string,
  options: { packageName?: string } = {}
): ParseLauncherActivitiesResult {
  const warnings: string[] = [];
  const packageName = options.packageName ?? inferPackageName(output);
  const candidates = new Map<string, AndroidLauncherActivity>();
  let currentComponent: string | undefined;
  let currentRawLine: string | undefined;

  if (output.trim().length === 0) {
    return { packageName, activities: [], warnings: ["dumpsys package output was empty."] };
  }

  for (const line of output.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const componentMatch = COMPONENT_PATTERN.exec(trimmed);
    if (componentMatch?.[1] !== undefined && componentMatch[2] !== undefined) {
      const candidatePackage = componentMatch[1];
      const activityName = componentMatch[2];
      if (candidatePackage === packageName) {
        currentComponent = `${candidatePackage}/${activityName}`;
        currentRawLine = trimmed;
        const existing = candidates.get(currentComponent);
        if (existing === undefined) {
          candidates.set(currentComponent, {
            packageName: candidatePackage,
            activityName: normalizeActivityName(candidatePackage, activityName),
            componentName: currentComponent,
            matchSource: "unknown",
            confidence: "low",
            rawLine: trimmed
          });
        }
      }
    }

    if (currentComponent === undefined) {
      continue;
    }
    const current = candidates.get(currentComponent);
    if (current === undefined) {
      continue;
    }

    const exported = parseBoolean(trimmed, "exported");
    const enabled = parseBoolean(trimmed, "enabled");
    if (exported !== undefined) {
      current.exported = exported;
    }
    if (enabled !== undefined) {
      current.enabled = enabled;
    }
    if (/disabled|enabled=false/iu.test(trimmed)) {
      current.enabled = false;
    }
    if (/android\.intent\.action\.MAIN|Action:\s*"?MAIN"?/iu.test(trimmed)) {
      current.matchSource = current.matchSource === "main_launcher" ? "main_launcher" : "resolver";
      current.confidence = current.confidence === "high" ? "high" : "medium";
    }
    if (/android\.intent\.category\.LAUNCHER|Category:\s*"?LAUNCHER"?/iu.test(trimmed)) {
      current.matchSource = "main_launcher";
      current.confidence = "high";
      if (current.rawLine === undefined && currentRawLine !== undefined) {
        current.rawLine = currentRawLine;
      }
    }
  }

  const activities = [...candidates.values()].filter(
    (activity) => activity.matchSource === "main_launcher" && activity.enabled !== false
  );
  if (activities.length === 0) {
    warnings.push("No enabled MAIN/LAUNCHER activity was parsed.");
  }
  return { packageName, activities, warnings };
}
