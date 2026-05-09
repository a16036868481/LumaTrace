const MAX_TEXT_LENGTH = 4096;
const MAX_ARRAY_LENGTH = 40;
const MAX_OBJECT_KEYS = 40;

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu;
const TOKEN_PATTERN =
  /\b(?:token|access_token|refresh_token|authorization|cookie|password|secret|api[_-]?key)\s*[:=]\s*["']?[^"',\s}]+/giu;
const WINDOWS_PATH_PATTERN = /[A-Za-z]:\\Users\\[^\\\s"'<>]+(?:\\[^\s"'<>]*)?/gu;
const UNIX_USER_PATH_PATTERN = /\/(?:Users|home)\/[^/\s"'<>]+(?:\/[^\s"'<>]*)?/gu;
const TEMP_PATH_PATTERN = /(?:\/tmp\/|\\Temp\\|\\TEMP\\)[^\s"'<>]*/gu;
const SERIAL_AFTER_ADB_PATTERN = /(-s\s+)([A-Za-z0-9_.:-]{5,})/gu;
const LONG_HEX_PATTERN = /\b[A-Fa-f0-9]{12,}\b/gu;
const ANDROID_DEVICE_ID_PATTERN = /\bandroid:([A-Za-z0-9_.:-]{8,})\b/gu;

export interface AndroidDiagnosticSanitizeOptions {
  serials?: readonly string[];
  maxTextLength?: number;
}

function maskSerial(serial: string): string {
  if (serial.startsWith("emulator-")) {
    return serial;
  }
  if (serial.length <= 8) {
    return "<device-serial>";
  }
  return `${serial.slice(0, 4)}...${serial.slice(-4)}`;
}

function truncate(value: string, maxTextLength: number): string {
  if (value.length <= maxTextLength) {
    return value;
  }
  return `${value.slice(0, maxTextLength)}...<truncated>`;
}

export function sanitizeAndroidText(
  value: string,
  options: AndroidDiagnosticSanitizeOptions = {}
): string {
  const maxTextLength = options.maxTextLength ?? MAX_TEXT_LENGTH;
  let sanitized = value
    .replace(EMAIL_PATTERN, "<email>")
    .replace(TOKEN_PATTERN, (match) => {
      const separator = match.includes("=") ? "=" : ":";
      const [key] = match.split(separator);
      return `${key}${separator}<redacted>`;
    })
    .replace(WINDOWS_PATH_PATTERN, "<user-path>")
    .replace(UNIX_USER_PATH_PATTERN, "<user-path>")
    .replace(TEMP_PATH_PATTERN, "<temp-path>")
    .replace(SERIAL_AFTER_ADB_PATTERN, "$1<device-serial>")
    .replace(ANDROID_DEVICE_ID_PATTERN, (_match, serial: string) => `android:${maskSerial(serial)}`)
    .replace(LONG_HEX_PATTERN, "<id>");

  for (const serial of options.serials ?? []) {
    if (serial.length === 0 || serial.startsWith("emulator-")) {
      continue;
    }
    sanitized = sanitized.split(serial).join(maskSerial(serial));
  }

  return truncate(sanitized, maxTextLength);
}

function sanitizeUnknown(
  value: unknown,
  options: AndroidDiagnosticSanitizeOptions,
  depth: number
): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string") {
    return sanitizeAndroidText(value, options);
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
    const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_OBJECT_KEYS);
    const output: Record<string, unknown> = {};
    for (const [key, entryValue] of entries) {
      if (/stack/i.test(key)) {
        continue;
      }
      if (/serial/i.test(key) && typeof entryValue === "string") {
        output[key] = maskSerial(entryValue);
      } else if (/stdout|stderr|output|raw/i.test(key) && typeof entryValue === "string") {
        output[key] = sanitizeAndroidText(entryValue, options);
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

export function sanitizeAndroidDiagnostic<T>(value: T, options: AndroidDiagnosticSanitizeOptions = {}): T {
  return sanitizeUnknown(value, options, 0) as T;
}
