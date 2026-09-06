export interface LocalServerInfo {
  mode: "dev" | "packaged";
  apiBaseUrl: string;
  wsBaseUrl: string;
  host?: string;
  port?: number;
  dataDirSanitized?: string;
  logsDirSanitized?: string;
}

export interface ChooseReportOutputDirectoryResult {
  cancelled: boolean;
  reportsDirSanitized?: string;
  localServer?: LocalServerInfo;
}

export interface AppPaths {
  dataDirSanitized: string;
  logsDirSanitized: string;
  reportsDirSanitized: string;
  diagnosticsDirSanitized: string;
}

type InvokeFn = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

declare global {
  interface Window {
    __TAURI__?: {
      core?: {
        invoke?: InvokeFn;
      };
    };
    __TAURI_INTERNALS__?: {
      invoke?: InvokeFn;
    };
  }
}

let cachedInfo: LocalServerInfo | null = null;

export function detectTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    (typeof window.__TAURI__?.core?.invoke === "function" ||
      typeof window.__TAURI_INTERNALS__?.invoke === "function")
  );
}

export async function invokeTauri<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const invoke = window.__TAURI__?.core?.invoke ?? window.__TAURI_INTERNALS__?.invoke;
  if (typeof invoke !== "function") {
    throw new Error("Tauri runtime is not available.");
  }
  return invoke<T>(command, args);
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function getCachedLocalServerInfo(): LocalServerInfo | null {
  return cachedInfo;
}

export async function getLocalServerInfo(): Promise<LocalServerInfo> {
  if (!detectTauri()) {
    const apiBaseUrl = trimTrailingSlash(import.meta.env.VITE_API_BASE_URL ?? "");
    const wsBaseUrl = trimTrailingSlash(import.meta.env.VITE_WS_BASE_URL ?? "ws://127.0.0.1:3100");
    return {
      mode: "dev",
      apiBaseUrl,
      wsBaseUrl
    };
  }

  cachedInfo = await invokeTauri<LocalServerInfo>("get_local_server_info");
  return cachedInfo;
}

export async function restartSidecar(): Promise<LocalServerInfo> {
  cachedInfo = await invokeTauri<LocalServerInfo>("restart_sidecar");
  return cachedInfo;
}

export async function openLogsDirectory(): Promise<void> {
  await invokeTauri<void>("open_logs_directory");
}

export async function openReportsDirectory(): Promise<void> {
  await invokeTauri<void>("open_reports_directory");
}

export async function openBugReportPage(): Promise<void> {
  const issueUrl = "https://github.com/a16036868481/LumaTrace/issues/new?template=bug_report.yml";
  if (!detectTauri()) {
    window.open(issueUrl, "_blank", "noopener,noreferrer");
    return;
  }
  await invokeTauri<void>("open_bug_report_page");
}

export async function getAppPaths(): Promise<AppPaths> {
  return invokeTauri<AppPaths>("get_app_paths");
}

export async function chooseReportOutputDirectory(): Promise<ChooseReportOutputDirectoryResult> {
  const result = await invokeTauri<ChooseReportOutputDirectoryResult>(
    "choose_report_output_directory"
  );
  if (result.localServer !== undefined) {
    cachedInfo = result.localServer;
  }
  return result;
}

export async function exportPackagingDiagnostics(): Promise<string> {
  return invokeTauri<string>("export_packaging_diagnostics");
}
