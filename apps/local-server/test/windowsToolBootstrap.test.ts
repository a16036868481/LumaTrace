import { describe, expect, it } from "vitest";
import {
  detectWindowsToolBootstrap,
  type WindowsToolBootstrapCommandRunner
} from "../src/diagnostics/windowsToolBootstrap";

function fakeRunner(outputs: Record<string, { exitCode?: number; stdout?: string; stderr?: string }>): WindowsToolBootstrapCommandRunner {
  return async (command, args) => {
    const key = `${command} ${args.join(" ")}`;
    const output = outputs[key];
    if (output === undefined) {
      return { exitCode: 1, stdout: "", stderr: "missing" };
    }
    return {
      exitCode: output.exitCode ?? 0,
      stdout: output.stdout ?? "",
      stderr: output.stderr ?? ""
    };
  };
}

describe("windows tool bootstrap", () => {
  it("detects adb and PresentMon from env/common paths without exposing raw paths as sanitized values", async () => {
    const status = await detectWindowsToolBootstrap({
      platform: "win32",
      arch: "x64",
      env: {
        PATH: "",
        LOCALAPPDATA: "C:\\Users\\Alice\\AppData\\Local",
        LUMATRACE_ADB_PATH: "C:\\Users\\Alice\\Android\\platform-tools\\adb.exe"
      },
      pathExists: async (path) =>
        path === "C:\\Users\\Alice\\Android\\platform-tools\\adb.exe" ||
        path === "C:\\Users\\Alice\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Intel.PresentMon.Console_test\\PresentMon.exe",
      readDirectory: async (path) =>
        path.endsWith("WinGet\\Packages") ? ["Intel.PresentMon.Console_test"] : [],
      commandRunner: fakeRunner({
        "winget --version": { stdout: "v1.9.0" },
        "C:\\Users\\Alice\\Android\\platform-tools\\adb.exe version": {
          stdout: "Android Debug Bridge version 1.0.41"
        },
        "C:\\Users\\Alice\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Intel.PresentMon.Console_test\\PresentMon.exe --version": {
          exitCode: 1,
          stdout: "PresentMon 2.4.1"
        }
      })
    });

    expect(status.wingetAvailable).toBe(true);
    expect(status.tools.find((tool) => tool.id === "adb")?.status).toBe("available");
    expect(status.tools.find((tool) => tool.id === "adb")?.version).toBe("1.0.41");
    expect(status.tools.find((tool) => tool.id === "presentmon")?.version).toBe("2.4.1");
    expect(status.tools.find((tool) => tool.id === "adb")?.pathSanitized).not.toContain("Alice");
    expect(status.productionBundlingAllowed).toBe(false);
  });

  it("reports installable missing tools when winget is available", async () => {
    const status = await detectWindowsToolBootstrap({
      platform: "win32",
      env: {
        PATH: "",
        LOCALAPPDATA: "C:\\Users\\Alice\\AppData\\Local"
      },
      pathExists: async () => false,
      readDirectory: async () => [],
      commandRunner: fakeRunner({
        "winget --version": { stdout: "v1.9.0" }
      })
    });

    expect(status.canInstallMissingTools).toBe(true);
    expect(status.tools.every((tool) => tool.available === false)).toBe(true);
    expect(status.suggestedActions.join("\n")).toContain("Google.PlatformTools");
    expect(status.suggestedActions.join("\n")).toContain("Intel.PresentMon.Console");
  });

  it("finds adb from winget PlatformTools package directories", async () => {
    const adbPath =
      "C:\\Users\\Alice\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Google.PlatformTools_test\\platform-tools\\adb.exe";
    const status = await detectWindowsToolBootstrap({
      platform: "win32",
      env: {
        PATH: "",
        LOCALAPPDATA: "C:\\Users\\Alice\\AppData\\Local"
      },
      pathExists: async (path) => path === adbPath,
      readDirectory: async (path) =>
        path.endsWith("WinGet\\Packages") ? ["Google.PlatformTools_test"] : [],
      commandRunner: fakeRunner({
        "winget --version": { stdout: "v1.9.0" },
        [`${adbPath} version`]: { stdout: "Android Debug Bridge version 1.0.41" }
      })
    });

    const adb = status.tools.find((tool) => tool.id === "adb");
    expect(adb?.available).toBe(true);
    expect(adb?.source).toBe("winget");
    expect(adb?.pathSanitized).not.toContain("Alice");
  });

  it("does not treat missing winget as a global failure", async () => {
    const status = await detectWindowsToolBootstrap({
      platform: "win32",
      env: {
        PATH: ""
      },
      pathExists: async () => false,
      readDirectory: async () => [],
      commandRunner: fakeRunner({})
    });

    expect(status.wingetAvailable).toBe(false);
    expect(status.canInstallMissingTools).toBe(false);
    expect(status.warnings.join(" ")).toMatch(/winget is unavailable/);
  });
});
