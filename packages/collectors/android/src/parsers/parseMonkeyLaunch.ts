import type { AndroidMonkeyLaunchResult } from "../lifecycle/AndroidLifecycleTypes";

export function parseMonkeyLaunch(output: string): AndroidMonkeyLaunchResult {
  const warnings: string[] = [];
  const eventsSentMatch = /Events injected:\s*(\d+)/iu.exec(output);
  const packageName =
    /pkg=([A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+)/iu.exec(output)?.[1] ??
    /bash arg:\s*([A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+)/iu.exec(output)?.[1];
  const eventsSent =
    eventsSentMatch?.[1] === undefined ? undefined : Number.parseInt(eventsSentMatch[1], 10);
  const hasError = /No activities found|Unknown package|Error|Exception/iu.test(output);
  const ok = eventsSent !== undefined && eventsSent > 0 && !hasError;

  if (output.trim().length === 0) {
    warnings.push("monkey output was empty.");
  }
  if (hasError) {
    warnings.push("monkey reported that launch was unavailable.");
    for (const line of output.split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (/No activities found|Unknown package|Error|Exception/iu.test(trimmed)) {
        warnings.push(trimmed);
      }
    }
  }
  if (eventsSent === undefined) {
    warnings.push("monkey did not report injected events.");
  }

  const result: AndroidMonkeyLaunchResult = {
    ok,
    warnings,
    rawOutput: output
  };
  if (eventsSent !== undefined && Number.isFinite(eventsSent)) {
    result.eventsSent = eventsSent;
  }
  if (packageName !== undefined) {
    result.packageName = packageName;
  }
  return result;
}
