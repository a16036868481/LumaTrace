import type { AndroidStartActivityResult } from "../lifecycle/AndroidLifecycleTypes";

function parseNumberField(output: string, key: string): number | undefined {
  const match = new RegExp(`${key}\\s*:\\s*(\\d+)`, "iu").exec(output);
  if (match?.[1] === undefined) {
    return undefined;
  }
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseAmStart(output: string): AndroidStartActivityResult {
  const warnings: string[] = [];
  const status = /Status\s*:\s*([^\r\n]+)/iu.exec(output)?.[1]?.trim();
  const activity = /Activity\s*:\s*([^\r\n]+)/iu.exec(output)?.[1]?.trim();
  const hasError = /Error:|Exception|not found|unable/i.test(output);
  const ok = status?.toLowerCase() === "ok" && !hasError;

  if (output.trim().length === 0) {
    warnings.push("am start output was empty.");
  }
  for (const line of output.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (/^Warning:/iu.test(trimmed)) {
      warnings.push(trimmed.replace(/^Warning:\s*/iu, ""));
    }
  }
  if (status === undefined) {
    warnings.push("am start status was not present.");
    warnings.push("am start output did not include Status: ok.");
  }
  if (hasError) {
    warnings.push("am start reported an error.");
    for (const line of output.split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (/Error:|Exception|not found|unable/iu.test(trimmed)) {
        warnings.push(trimmed);
      }
    }
  }

  const result: AndroidStartActivityResult = {
    ok,
    warnings,
    rawOutput: output
  };
  if (status !== undefined) {
    result.status = status;
  }
  if (activity !== undefined) {
    result.activity = activity;
  }
  const thisTimeMs = parseNumberField(output, "ThisTime");
  const totalTimeMs = parseNumberField(output, "TotalTime");
  const waitTimeMs = parseNumberField(output, "WaitTime");
  if (thisTimeMs !== undefined) {
    result.thisTimeMs = thisTimeMs;
  }
  if (totalTimeMs !== undefined) {
    result.totalTimeMs = totalTimeMs;
  }
  if (waitTimeMs !== undefined) {
    result.waitTimeMs = waitTimeMs;
  }
  return result;
}
