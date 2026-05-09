import { exportPackagedDiagnostics } from "../api/endpoints";
import { detectTauri } from "./tauriClient";
import { exportPackagingDiagnostics } from "./tauriClient";

export async function getPackagingDiagnosticsJson(): Promise<string> {
  if (!detectTauri()) {
    return JSON.stringify(await exportPackagedDiagnostics(), null, 2);
  }
  return exportPackagingDiagnostics();
}
