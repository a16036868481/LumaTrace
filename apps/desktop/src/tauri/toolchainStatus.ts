import { detectTauri, invokeTauri } from "./tauriClient";

export interface ToolchainStatus {
  rustAvailable: boolean;
  cargoVersion?: string;
  rustcVersion?: string;
  tauriCliAvailable: boolean;
  tauriCliVersion?: string;
  nodeVersion?: string;
  pnpmVersion?: string;
  platform: string;
  arch: string;
  canRunTauriDev: boolean;
  canRunTauriBuild: boolean;
  missingTools: string[];
  suggestedActions: string[];
}

export async function getTauriToolchainStatus(): Promise<ToolchainStatus> {
  if (!detectTauri()) {
    return {
      rustAvailable: false,
      tauriCliAvailable: false,
      platform: navigator.platform,
      arch: "unknown",
      canRunTauriDev: false,
      canRunTauriBuild: false,
      missingTools: ["tauri-runtime"],
      suggestedActions: ["Run pnpm detect:tauri-toolchain from a terminal for local Rust/Tauri status."]
    };
  }
  return invokeTauri<ToolchainStatus>("get_tauri_toolchain_status");
}

