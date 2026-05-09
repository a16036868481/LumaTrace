import type { PackageUidResult } from "../types";

export function parsePackageUid(output: string): PackageUidResult {
  const patterns: ReadonlyArray<readonly [PackageUidResult["source"], RegExp]> = [
    ["userId", /\buserId=(\d+)\b/u],
    ["appId", /\bappId=(\d+)\b/u],
    ["uid", /\buid=(\d+)\b/u]
  ];

  for (const [source, pattern] of patterns) {
    const match = pattern.exec(output);
    if (match?.[1] !== undefined) {
      const result: PackageUidResult = {
        uid: Number.parseInt(match[1], 10),
        confidence: source === "uid" ? "medium" : "high"
      };
      if (source !== undefined) {
        result.source = source;
      }
      return {
        ...result
      };
    }
  }

  return {
    uid: null,
    confidence: "low"
  };
}
