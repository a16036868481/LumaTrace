import { existsSync } from "node:fs";
import { delimiter, resolve } from "node:path";
import { spawn } from "node:child_process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

type TauriCommand = "check" | "dev" | "build";

const command = process.argv[2] as TauriCommand | undefined;
if (command !== "check" && command !== "dev" && command !== "build") {
  console.error("Usage: node --experimental-strip-types scripts/run-tauri.ts <check|dev|build>");
  process.exit(1);
}

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const desktopDir = resolve(root, "apps/desktop");
const cargoBin = process.env.USERPROFILE === undefined ? undefined : resolve(process.env.USERPROFILE, ".cargo/bin");
const appDataNpm = process.env.APPDATA === undefined ? undefined : resolve(process.env.APPDATA, "npm");
const desktopBin = resolve(desktopDir, "node_modules/.bin");

const pathParts = [cargoBin, appDataNpm, desktopBin, process.env.PATH].filter(
  (value): value is string => value !== undefined && value.length > 0
);
const env = {
  ...process.env,
  PATH: pathParts.join(delimiter)
};

function withWindowsBuildEnv(baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const vsDevCmd = "C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\Common7\\Tools\\VsDevCmd.bat";
  if (process.platform !== "win32" || !existsSync(vsDevCmd)) {
    return baseEnv;
  }

  const result = spawnSync("cmd.exe", ["/d", "/c", `call "${vsDevCmd}" -arch=x64 -host_arch=x64 >nul && set`], {
    encoding: "utf8",
    env: baseEnv,
    windowsHide: true
  });
  if (result.status !== 0) {
    return baseEnv;
  }

  const nextEnv = { ...baseEnv };
  for (const line of result.stdout.split(/\r?\n/)) {
    const index = line.indexOf("=");
    if (index > 0) {
      nextEnv[line.slice(0, index)] = line.slice(index + 1);
    }
  }
  nextEnv.PATH = [cargoBin, appDataNpm, desktopBin, nextEnv.PATH].filter((value): value is string => value !== undefined).join(delimiter);
  return nextEnv;
}

const commandEnv = withWindowsBuildEnv(env);
const cargoCommand = process.platform === "win32" && cargoBin !== undefined ? resolve(cargoBin, "cargo.exe") : "cargo";
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const tauriDevConfig = "src-tauri/tauri.dev.conf.json";

if (command === "dev") {
  const coreBuild =
    process.platform === "win32"
      ? spawnSync("cmd.exe", ["/d", "/c", "pnpm --filter @lumatrace/core build"], {
          cwd: root,
          env: commandEnv,
          stdio: "inherit",
          windowsHide: false
        })
      : spawnSync(pnpmCommand, ["--filter", "@lumatrace/core", "build"], {
          cwd: root,
          env: commandEnv,
          stdio: "inherit"
        });
  if (coreBuild.status !== 0) {
    process.exit(coreBuild.status ?? 1);
  }
}

const child =
  command === "check"
    ? spawn(cargoCommand, ["check", "--manifest-path", resolve(root, "apps/desktop/src-tauri/Cargo.toml")], {
        cwd: root,
        env: commandEnv,
        stdio: "inherit",
        windowsHide: false
      })
    : process.platform === "win32"
      ? spawn("cmd.exe", ["/d", "/c", `pnpm exec tauri ${command}${command === "dev" ? ` --config ${tauriDevConfig}` : ""}`], {
          cwd: desktopDir,
          env: commandEnv,
          stdio: "inherit",
          windowsHide: false
        })
      : spawn("pnpm", ["exec", "tauri", command, ...(command === "dev" ? ["--config", tauriDevConfig] : [])], {
          cwd: desktopDir,
          env: commandEnv,
          stdio: "inherit"
        });

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
