import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyPresentMonCsvRetention,
  buildPresentMonCsvRetentionPlan,
  validatePresentMonCsvSize
} from "../src";

describe("PresentMonCsvRetention", () => {
  it("defaults to delete_after_parse and deletes CSV", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "opl-retention-"));
    const file = path.join(dir, "capture.csv");
    await writeFile(file, "Application,ProcessID\nGame.exe,4321\n", "utf8");
    const result = await applyPresentMonCsvRetention(file, buildPresentMonCsvRetentionPlan());
    expect(result.action).toBe("deleted");
    await expect(stat(file)).rejects.toThrow();
  });

  it("keeps CSV when user requested and sanitizes path", async () => {
    const plan = buildPresentMonCsvRetentionPlan({
      keepPresentMonCsv: true,
      presentMonOutputDir: "C:\\Users\\alice\\Temp"
    });
    const result = await applyPresentMonCsvRetention(
      "C:\\Users\\alice\\Temp\\capture.csv",
      plan
    );
    expect(result.action).toBe("kept");
    expect(result.pathSanitized).not.toContain("alice");
  });

  it("rejects oversized CSV and reports delete failures", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "opl-retention-"));
    const file = path.join(dir, "capture.csv");
    await writeFile(file, "too large", "utf8");
    const oversize = await validatePresentMonCsvSize(
      file,
      buildPresentMonCsvRetentionPlan({ maxCsvSizeBytes: 1 })
    );
    expect(oversize.action).toBe("rejected_oversize");

    const deleteFailure = await applyPresentMonCsvRetention(
      file,
      buildPresentMonCsvRetentionPlan(),
      async () => {
        throw new Error("locked");
      }
    );
    expect(deleteFailure.action).toBe("delete_failed");
    expect(await readFile(file, "utf8")).toContain("too large");
  });
});
