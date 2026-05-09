const MAX_TEXT_LENGTH = 4096;
const MAX_ARRAY_LENGTH = 40;
const MAX_OBJECT_KEYS = 40;

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu;
const TOKEN_PATTERN =
  /\b(token|access_token|refresh_token|authorization|cookie|password|secret|api[_-]?key)\b\s*([:=]\s*|\s+)["']?[^"',\s}]+/giu;
const WINDOWS_USER_PATH_PATTERN = /[A-Za-z]:\\Users\\[^\\\s"'<>]+(?:\\[^\s"'<>]*)?/gu;
const UNIX_USER_PATH_PATTERN = /\/(?:Users|home)\/[^/\s"'<>]+(?:\/[^\s"'<>]*)?/gu;

export interface PcDiagnosticSanitizeOptions {
  maxTextLength?: number;
}

function truncate(value: string, maxTextLength: number): string {
  if (value.length <= maxTextLength) {
    return value;
  }
  return `${value.slice(0, maxTextLength)}...<truncated>`;
}

export function sanitizePcText(value: string, options: PcDiagnosticSanitizeOptions = {}): string {
  const maxTextLength = options.maxTextLength ?? MAX_TEXT_LENGTH;
  return truncate(
    value
      .replace(EMAIL_PATTERN, "<email>")
      .replace(TOKEN_PATTERN, (_match, key: string, separator: string) => {
        return `${key}${separator}<redacted>`;
      })
      .replace(WINDOWS_USER_PATH_PATTERN, "<user-path>")
      .replace(UNIX_USER_PATH_PATTERN, "<user-path>"),
    maxTextLength
  );
}

function sanitizeUnknown(value: unknown, options: PcDiagnosticSanitizeOptions, depth: number): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string") {
    return sanitizePcText(value, options);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    if (depth > 5) {
      return `<array:${value.length}>`;
    }
    return value.slice(0, MAX_ARRAY_LENGTH).map((item) => sanitizeUnknown(item, options, depth + 1));
  }
  if (typeof value === "object") {
    if (depth > 5) {
      return `<object:${Object.keys(value).length} keys>`;
    }
    const output: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_OBJECT_KEYS);
    for (const [key, entryValue] of entries) {
      if (/stack/i.test(key)) {
        continue;
      }
      if (/commandLine/i.test(key) && typeof entryValue === "string") {
        output[key] = "<redacted-command-line>";
      } else {
        output[key] = sanitizeUnknown(entryValue, options, depth + 1);
      }
    }
    if (Object.keys(value as Record<string, unknown>).length > MAX_OBJECT_KEYS) {
      output.truncatedKeys = true;
    }
    return output;
  }
  return String(value);
}

export function sanitizePcDiagnostic<T>(value: T, options: PcDiagnosticSanitizeOptions = {}): T {
  return sanitizeUnknown(value, options, 0) as T;
}
