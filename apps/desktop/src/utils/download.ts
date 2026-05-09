import type { ExportFormat } from "../api/types";

function extensionFor(format: ExportFormat): string {
  return format === "json" ? "json" : format;
}

function contentTypeFor(format: ExportFormat): string {
  if (format === "json") {
    return "application/json;charset=utf-8";
  }
  if (format === "csv") {
    return "text/csv;charset=utf-8";
  }
  return "text/html;charset=utf-8";
}

function sanitizeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "-").slice(0, 80);
}

export function downloadTextFile(content: string, format: ExportFormat, sessionId: string): void {
  const blob = new Blob([content], { type: contentTypeFor(format) });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  anchor.href = url;
  anchor.download = `lumatrace-${sanitizeFilePart(sessionId)}-${date}.${extensionFor(format)}`;
  anchor.click();
  URL.revokeObjectURL(url);
}
