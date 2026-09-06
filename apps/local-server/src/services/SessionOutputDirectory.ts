import { join } from "node:path";
import type { Session } from "@lumatrace/core";

export const SESSION_REPORT_FOLDER_LABEL_CONFIG_KEY = "reportFolderLabel";
export const SESSION_REPORT_FOLDER_CREATED_AT_CONFIG_KEY = "reportFolderCreatedAtMs";

const WINDOWS_RESERVED_NAME = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i;

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

function formatLocalTimestamp(timestampMs: number): string {
  const date = new Date(timestampMs);
  const datePart = [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join("-");
  const timePart = `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  return `${datePart}_${timePart}-${pad(date.getMilliseconds(), 3)}`;
}

export function sanitizeSessionFolderLabel(value: string): string {
  const normalized = [...value.normalize("NFKC")]
    .map((character) => (character.charCodeAt(0) < 32 ? "_" : character))
    .join("");
  const cleaned = normalized
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\.{2,}/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._]+/, "")
    .replace(/[._]+$/g, "")
    .trim();
  const shortened = [...cleaned].slice(0, 64).join("").replace(/[._]+$/g, "");

  if (shortened.length === 0) {
    return "Test";
  }
  return WINDOWS_RESERVED_NAME.test(shortened) ? `Test_${shortened}` : shortened;
}

function configString(session: Session, key: string): string | undefined {
  const value = session.config?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function configTimestamp(session: Session, key: string): number | undefined {
  const value = session.config?.[key];
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function buildSessionOutputDirectory(
  reportRootDir: string,
  session: Session,
  generatedAtMs: number
): string {
  const label = sanitizeSessionFolderLabel(
    configString(session, SESSION_REPORT_FOLDER_LABEL_CONFIG_KEY) ?? session.name
  );
  const timestampMs =
    configTimestamp(session, SESSION_REPORT_FOLDER_CREATED_AT_CONFIG_KEY) ??
    session.startedAt ??
    session.endedAt ??
    generatedAtMs;
  const sessionSuffix =
    sanitizeSessionFolderLabel(session.id).replace(/[^A-Za-z0-9]/g, "").slice(-8) ||
    "session";
  const folderName = `${label}_${formatLocalTimestamp(timestampMs)}_${sessionSuffix}`;
  return join(reportRootDir, folderName);
}
