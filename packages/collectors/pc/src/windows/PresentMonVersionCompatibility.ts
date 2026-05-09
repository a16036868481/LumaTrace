export interface PresentMonCompatibility {
  version?: string;
  supportsOutputFile: boolean;
  supportsTimedCapture: boolean;
  supportsProcessIdFilter: boolean;
  supportsProcessNameFilter: boolean;
  supportsTerminateAfterTimer: boolean;
  warnings: string[];
  recommendedArgsStyle: "long" | "classic";
  unsupportedReason?: string;
}

export function detectPresentMonCompatibility(
  versionOutput = "",
  helpOutput = ""
): PresentMonCompatibility {
  const combined = `${versionOutput}\n${helpOutput}`;
  const versionMatch =
    /(?:PresentMon(?:\s+(?:version|v))?\s*[: ]\s*|(?:version|v)\s*[: ]\s*)([0-9]+(?:\.[0-9]+){1,3})/iu.exec(
      combined
    );
  const warnings: string[] = [];
  const supportsOutputFile = /(?:--|-)?output[_-]?file|(?:--|-)?output\b/iu.test(helpOutput);
  const supportsTimedCapture = /(?:--|-)?timed|duration|capture.*seconds/iu.test(helpOutput);
  const supportsProcessIdFilter = /(?:--|-)?process[_-]?id|(?:--|-)?pid\b/iu.test(helpOutput);
  const supportsProcessNameFilter = /(?:--|-)?process[_-]?name|(?:--|-)?process\b/iu.test(helpOutput);
  const supportsTerminateAfterTimer = /stop_existing_session|terminate|timed/iu.test(helpOutput);
  const usesLong = /--output[_-]?file|--timed|--process[_-]?(?:id|name)/iu.test(helpOutput);

  if (!supportsProcessIdFilter) {
    warnings.push("PresentMon help output did not advertise a PID filter; process-name targeting may be used.");
  }
  if (!supportsOutputFile) {
    warnings.push("PresentMon help output did not advertise CSV output file support.");
  }
  if (!supportsTimedCapture) {
    warnings.push("PresentMon help output did not advertise timed capture support.");
  }

  const compatibility: PresentMonCompatibility = {
    ...(versionMatch?.[1] === undefined ? {} : { version: versionMatch[1] }),
    supportsOutputFile,
    supportsTimedCapture,
    supportsProcessIdFilter,
    supportsProcessNameFilter,
    supportsTerminateAfterTimer,
    warnings,
    recommendedArgsStyle: usesLong ? "long" : "classic"
  };

  if (!supportsOutputFile || !supportsTimedCapture) {
    compatibility.unsupportedReason =
      "PresentMon timed CSV capture requires output file and timed capture CLI support.";
  }
  return compatibility;
}
