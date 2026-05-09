const MAX_TEXT_LENGTH = 4096;

const TOKEN_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gu,
  /lumatrace-auth\.[A-Za-z0-9._~+/=-]+/gu,
  /(--auth-token\s+)[^\s]+/gu,
  /(--token\s+)[^\s]+/gu,
  /(LUMATRACE_AUTH_TOKEN=)[^\s]+/gu,
  /((?:token|authToken|authorization|secret|password)\s*[:=]\s*)["']?[^"',\s}]+["']?/giu
];

const PATH_PATTERNS = [
  /[A-Z]:\\Users\\[^\\\r\n\t ]+(?:\\[^"\r\n\t ]*)?/giu,
  /\/Users\/[^/\r\n\t ]+(?:\/[^"\r\n\t ]*)?/gu,
  /\/home\/[^/\r\n\t ]+(?:\/[^"\r\n\t ]*)?/gu,
  /\/tmp\/[^/\r\n\t ]+(?:\/[^"\r\n\t ]*)?/gu
];

function redactString(input: string): string {
  let output = input;
  for (const pattern of TOKEN_PATTERNS) {
    output = output.replace(pattern, (match: string, prefix?: string) => {
      if (prefix !== undefined && prefix.length > 0 && !match.startsWith("Bearer")) {
        return `${prefix}<redacted>`;
      }
      return match.startsWith("Bearer") ? "Bearer <redacted>" : "<redacted>";
    });
  }
  for (const pattern of PATH_PATTERNS) {
    output = output.replace(pattern, "<local-path>");
  }
  output = output
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gu, "<email>")
    .replace(/(at\s+.+\()?[A-Z]:\\[^)\r\n]+:\d+:\d+\)?/giu, "<stack-frame>")
    .replace(/(at\s+.+\()?\/(?:Users|home|tmp)\/[^)\r\n]+:\d+:\d+\)?/gu, "<stack-frame>")
    .replace(/\b(?:[A-F0-9]{12,}|[a-f0-9]{16,})\b/gu, "<id>");

  if (output.length > MAX_TEXT_LENGTH) {
    return `${output.slice(0, MAX_TEXT_LENGTH)}...<truncated>`;
  }
  return output;
}

function isSensitiveKey(key: string): boolean {
  return /^(command|args)$/iu.test(key) ||
    /commandLine|stack|stdout|stderr|rawCsv|rawLog|authToken|authorization|token|secret|password/iu.test(key);
}

export function sanitizePackagedDiagnosticText(value: string | undefined): string | undefined {
  return value === undefined ? undefined : redactString(value);
}

export function sanitizePackagedDiagnostics<T>(value: T): T {
  if (typeof value === "string") {
    return redactString(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizePackagedDiagnostics(entry)) as T;
  }
  if (value !== null && typeof value === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (isSensitiveKey(key) && typeof entry === "string") {
        sanitized[key] = redactString(entry);
      } else if (isSensitiveKey(key) && Array.isArray(entry)) {
        sanitized[key] = entry.map((item, index, values) => {
          if (typeof item !== "string") {
            return "<redacted>";
          }
          const previous = values[index - 1];
          if (previous === "--auth-token" || previous === "--token") {
            return "<redacted>";
          }
          return redactString(item);
        });
      } else {
        sanitized[key] = sanitizePackagedDiagnostics(entry);
      }
    }
    return sanitized as T;
  }
  return value;
}
