function stringifyDisplayValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "N/A";
  }

  if (typeof value === "number" && Number.isNaN(value)) {
    return "N/A";
  }

  if (typeof value === "object") {
    return JSON.stringify(value) ?? "N/A";
  }

  return String(value);
}

export function htmlEscape(value: unknown): string {
  return stringifyDisplayValue(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatValue(value: unknown): string {
  return htmlEscape(value);
}
