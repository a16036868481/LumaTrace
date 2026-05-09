export interface SanitizeCommandLogOptions {
  sensitiveValues?: readonly string[];
  redactPackageNames?: boolean;
}

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const WINDOWS_USER_PATH_PATTERN = /[A-Z]:\\Users\\[^\\\s"]+(?:\\[^\s"]*)?/gi;
const UNIX_USER_PATH_PATTERN = /\/(?:Users|home)\/[^/\s"]+(?:\/[^\s"]*)?/g;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const KEY_VALUE_SECRET_PATTERN =
  /\b(token|access_token|refresh_token|auth|api[_-]?key|password|secret)\b\s*([:=]\s*|\s+)[^\s&"']+/gi;
const PACKAGE_OR_BUNDLE_PATTERN = /\b(?:[a-z][a-z0-9_]*\.){2,}[a-z][a-z0-9_]*\b/gi;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function looksLikeDeviceSerial(token: string): boolean {
  if (token.length < 8 || token.length > 64) {
    return false;
  }

  if (!/^[A-Za-z0-9_-]+$/.test(token)) {
    return false;
  }

  const digitCount = (token.match(/\d/g) ?? []).length;
  const letterCount = (token.match(/[A-Za-z]/g) ?? []).length;
  return digitCount >= 3 && letterCount >= 2;
}

function redactLikelySerials(input: string): string {
  return input.replace(/\b[A-Za-z0-9_-]{8,64}\b/g, (token) =>
    looksLikeDeviceSerial(token) ? "<device-serial>" : token
  );
}

export function sanitizeCommandLog(input: string, options: SanitizeCommandLogOptions = {}): string {
  let sanitized = input;

  for (const sensitiveValue of options.sensitiveValues ?? []) {
    if (sensitiveValue.length > 0) {
      sanitized = sanitized.replace(new RegExp(escapeRegExp(sensitiveValue), "g"), "<redacted>");
    }
  }

  sanitized = sanitized
    .replace(BEARER_PATTERN, "Bearer <token>")
    .replace(KEY_VALUE_SECRET_PATTERN, (_match, key: string, separator: string) => {
      return `${key}${separator}<redacted>`;
    })
    .replace(EMAIL_PATTERN, "<email>")
    .replace(WINDOWS_USER_PATH_PATTERN, "<user-path>")
    .replace(UNIX_USER_PATH_PATTERN, "<user-path>");

  if (options.redactPackageNames === true) {
    sanitized = sanitized.replace(PACKAGE_OR_BUNDLE_PATTERN, "<app-id>");
  }

  return redactLikelySerials(sanitized);
}

export function sanitizeCommandParts(
  command: string,
  args: readonly string[] = [],
  options: SanitizeCommandLogOptions = {}
): string {
  return sanitizeCommandLog([command, ...args].join(" "), options);
}
