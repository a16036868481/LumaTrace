import { fileURLToPath } from "node:url";
import { detectTauriToolchain, type ToolchainStatus } from "../apps/local-server/src/diagnostics/tauriToolchainDetection.ts";

function printStatus(status: ToolchainStatus): void {
  console.log(JSON.stringify(status, null, 2));
  if (!status.canRunTauriBuild) {
    console.log("");
    console.log("Tauri Rust build is not available in this environment.");
    for (const action of status.suggestedActions) {
      console.log(`- ${action}`);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const status = await detectTauriToolchain();
  printStatus(status);
  if (process.argv.includes("--require-tauri") && !status.canRunTauriBuild) {
    process.exitCode = 1;
  }
}

