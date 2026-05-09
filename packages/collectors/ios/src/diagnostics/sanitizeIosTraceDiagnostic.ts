const MAX_TEXT_LENGTH = 4096;

function sanitizeText(value: string): string {
  const sanitized = value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/giu, "Bearer <redacted>")
    .replace(/lumatrace-auth\.[A-Za-z0-9._~+/=-]+/giu, "lumatrace-auth.<redacted>")
    .replace(/\b(token|secret|password|cookie)=["']?[^"'\s,;]+/giu, "$1=<redacted>")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, "<email>")
    .replace(/[A-Za-z]:\\Users\\[^\\\s"'<>]+(?:\\[^\s"'<>]*)?/gu, "<user-path>")
    .replace(/\/(?:Users|home)\/[^/\s"'<>]+(?:\/[^\s"'<>]*)?/gu, "<user-path>")
    .replace(/\b[0-9A-F]{8}-[0-9A-F]{16}\b/giu, "<ios-udid>")
    .replace(/\b[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\b/giu, "<ios-udid>")
    .replace(/(?:\bat\s+.+\(.+\)|^\s*at\s+.+$)/gmu, "<stack-frame>");

  if (sanitized.length <= MAX_TEXT_LENGTH) {
    return sanitized;
  }
  return `${sanitized.slice(0, MAX_TEXT_LENGTH)}...<truncated>`;
}

export function sanitizeIosTraceDiagnostic(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizeText(value);
  }
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 40).map((item) => sanitizeIosTraceDiagnostic(item));
  }
  if (typeof value === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
      if (/rawCsv|rawTrace|stack|commandLine/iu.test(key)) {
        sanitized[key] = "<redacted>";
        continue;
      }
      sanitized[key] = sanitizeIosTraceDiagnostic(entry);
    }
    return sanitized;
  }
  return sanitizeText(String(value));
}
