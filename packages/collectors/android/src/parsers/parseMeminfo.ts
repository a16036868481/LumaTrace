export interface AndroidMeminfo {
  totalPssKb?: number;
  totalPssMb?: number;
  nativeHeapKb?: number;
  nativeHeapMb?: number;
  dalvikHeapKb?: number;
  dalvikHeapMb?: number;
  javaHeapKb?: number;
  javaHeapMb?: number;
  privateDirtyKb?: number;
  privateDirtyMb?: number;
  swapPssKb?: number;
  swapPssMb?: number;
  summary?: Record<string, number>;
  warnings: string[];
  unavailable: boolean;
}

const SUMMARY_KEY_MAP: Record<string, string> = {
  "Java Heap": "javaHeapKb",
  "Native Heap": "nativeHeapKb"
};

function kbToMb(kb: number): number {
  return kb / 1024;
}

function parseIntSafe(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number.parseInt(value.replaceAll(",", ""), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function assignKb(info: AndroidMeminfo, kbKey: keyof AndroidMeminfo, mbKey: keyof AndroidMeminfo, value: number): void {
  Object.assign(info, {
    [kbKey]: value,
    [mbKey]: kbToMb(value)
  });
}

function normalizeSummaryKey(key: string): string {
  return key.trim().replace(/\s+/gu, " ");
}

export function parseMeminfo(output: string): AndroidMeminfo {
  const warnings: string[] = [];
  const info: AndroidMeminfo = {
    warnings,
    unavailable: false
  };

  if (output.trim().length === 0 || /No process found/i.test(output)) {
    info.unavailable = true;
    warnings.push("dumpsys meminfo did not contain process memory data.");
    return info;
  }

  const summary: Record<string, number> = {};
  for (const line of output.split(/\r?\n/u)) {
    const trimmed = line.trim();
    const rowMatch = /^(Native Heap|Dalvik Heap|TOTAL)\s+([\d,]+)(?:\s+([\d,]+))?(?:\s+[\d,]+)?(?:\s+([\d,]+))?/u.exec(
      trimmed
    );
    if (rowMatch?.[1] !== undefined) {
      const label = rowMatch[1];
      const pssKb = parseIntSafe(rowMatch[2]);
      const privateDirtyKb = parseIntSafe(rowMatch[3]);
      const swapPssKb = parseIntSafe(rowMatch[4]);
      if (pssKb !== undefined) {
        if (label === "Native Heap") {
          assignKb(info, "nativeHeapKb", "nativeHeapMb", pssKb);
        } else if (label === "Dalvik Heap") {
          assignKb(info, "dalvikHeapKb", "dalvikHeapMb", pssKb);
        } else if (label === "TOTAL") {
          assignKb(info, "totalPssKb", "totalPssMb", pssKb);
        }
      }
      if (label === "TOTAL" && privateDirtyKb !== undefined) {
        assignKb(info, "privateDirtyKb", "privateDirtyMb", privateDirtyKb);
      }
      if (label === "TOTAL" && swapPssKb !== undefined) {
        assignKb(info, "swapPssKb", "swapPssMb", swapPssKb);
      }
      continue;
    }

    const totalPssMatch = /^TOTAL PSS:\s*([\d,]+)/iu.exec(trimmed);
    if (totalPssMatch?.[1] !== undefined) {
      const total = parseIntSafe(totalPssMatch[1]);
      if (total !== undefined) {
        assignKb(info, "totalPssKb", "totalPssMb", total);
      }
      continue;
    }

    const summaryMatch = /^([A-Za-z ]+):\s*([\d,]+)/u.exec(trimmed);
    if (summaryMatch?.[1] !== undefined && summaryMatch[2] !== undefined) {
      const key = normalizeSummaryKey(summaryMatch[1]);
      const value = parseIntSafe(summaryMatch[2]);
      if (value !== undefined) {
        summary[key] = value;
        const mappedKey = SUMMARY_KEY_MAP[key];
        if (mappedKey === "javaHeapKb") {
          assignKb(info, "javaHeapKb", "javaHeapMb", value);
        }
        if (mappedKey === "nativeHeapKb") {
          assignKb(info, "nativeHeapKb", "nativeHeapMb", value);
        }
        if (key === "TOTAL") {
          assignKb(info, "totalPssKb", "totalPssMb", value);
        }
      }
    }
  }

  if (Object.keys(summary).length > 0) {
    info.summary = summary;
  }
  if (info.totalPssKb === undefined) {
    warnings.push("Unable to parse total PSS from dumpsys meminfo.");
  }

  return info;
}
