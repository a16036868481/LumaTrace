import { detectTauri, invokeTauri } from "./tauriClient";

export interface AppPaths {
  dataDirSanitized?: string;
  logsDirSanitized?: string;
  reportsDirSanitized?: string;
  diagnosticsDirSanitized?: string;
}

export async function getAppPaths(): Promise<AppPaths> {
  if (!detectTauri()) {
    return {};
  }
  return invokeTauri<AppPaths>("get_app_paths");
}
