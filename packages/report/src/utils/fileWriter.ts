import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { GeneratedReport, ReportFilePaths, ReportGeneratorOptions } from "../types";

export function sanitizeFileBaseName(name: string): string {
  const sanitized = name.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "");
  return sanitized.length > 0 ? sanitized : "report";
}

export async function writeReportFiles(
  report: GeneratedReport,
  options: ReportGeneratorOptions
): Promise<ReportFilePaths> {
  if (options.outputDir === undefined) {
    throw new Error("outputDir is required to write report files.");
  }

  const baseName = sanitizeFileBaseName(options.fileBaseName ?? report.sessionId);
  await mkdir(options.outputDir, { recursive: true });

  const jsonPath = join(options.outputDir, `${baseName}.json`);
  const csvPath = join(options.outputDir, `${baseName}.csv`);
  const htmlPath = join(options.outputDir, `${baseName}.html`);

  await Promise.all([
    writeFile(jsonPath, report.json, "utf8"),
    writeFile(csvPath, report.csv, "utf8"),
    writeFile(htmlPath, report.html, "utf8")
  ]);

  return {
    htmlPath,
    jsonPath,
    csvPath
  };
}
