import { describe, expect, it } from "vitest";
import { detectTauriToolchain, type ToolchainCommandRunner } from "../src/diagnostics/tauriToolchainDetection";

function fakeRunner(versions: Record<string, string>): ToolchainCommandRunner {
  return async (command, args) => {
    const key = `${command} ${args.join(" ")}`;
    const value = versions[key];
    return value === undefined
      ? { ok: false, stdout: "", stderr: "missing" }
      : { ok: true, stdout: value, stderr: "" };
  };
}

describe("tauri toolchain detection", () => {
  it("reports available cargo/rustc/Tauri CLI", async () => {
    const status = await detectTauriToolchain(
      fakeRunner({
        "cargo --version": "cargo 1.80.0",
        "rustc --version": "rustc 1.80.0",
        "rustup --version": "rustup 1.27.0",
        "pnpm --version": "9.15.4",
        "pnpm --filter @lumatrace/desktop exec tauri --version": "tauri-cli 2.0.0"
      })
    );

    expect(status.rustAvailable).toBe(true);
    expect(status.tauriCliAvailable).toBe(true);
    expect(status.canRunTauriBuild).toBe(true);
    expect(status.missingTools).toEqual([]);
  });

  it("reports missing cargo and tauri without auto-installing", async () => {
    const status = await detectTauriToolchain(fakeRunner({ "pnpm --version": "9.15.4" }));

    expect(status.rustAvailable).toBe(false);
    expect(status.tauriCliAvailable).toBe(false);
    expect(status.canRunTauriDev).toBe(false);
    expect(status.missingTools).toContain("rust");
    expect(status.missingTools).toContain("tauri-cli");
    expect(status.suggestedActions.join(" ")).toMatch(/Install Rust/);
  });

  it("falls back to root pnpm tauri CLI when desktop CLI is missing", async () => {
    const status = await detectTauriToolchain(
      fakeRunner({
        "cargo --version": "cargo 1.80.0",
        "rustc --version": "rustc 1.80.0",
        "pnpm --version": "9.15.4",
        "pnpm exec tauri --version": "tauri-cli 2.0.0"
      })
    );

    expect(status.tauriCliAvailable).toBe(true);
    expect(status.canRunTauriDev).toBe(true);
  });
});
