import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  getDevWrapperSidecarFileName,
  getSidecarTargetTriple,
  hashFile
} from "../dist/src/diagnostics/packagedDiagnostics.js";

interface SidecarManifest {
  name: string;
  version: string;
  artifactKind: "dev-wrapper" | "self-contained";
  platform: NodeJS.Platform;
  arch: NodeJS.Architecture;
  targetTriple?: string;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  buildTime: string;
  sourcePackageVersion: string;
  nodeRequired: boolean;
  productionReady: boolean;
  limitations: string[];
  tauriExternalBin?: string;
}

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const binariesDir = resolve(root, "apps/desktop/src-tauri/binaries");
const wrapperName = getDevWrapperSidecarFileName();
const wrapperPath = resolve(binariesDir, wrapperName);
const legacyWrapperName = process.platform === "win32" ? "lumatrace-local-server-dev.cmd" : "lumatrace-local-server-dev";
const legacyWrapperPath = resolve(binariesDir, legacyWrapperName);
const manifestPath = resolve(binariesDir, "sidecar-manifest.json");

mkdirSync(binariesDir, { recursive: true });

const nodeCommand =
  process.platform === "win32"
    ? `@echo off\r\nnode --import "%~dp0..\\..\\..\\local-server\\scripts\\register-esm-loader.mjs" "%~dp0..\\..\\..\\local-server\\dist\\src\\index.js" %*\r\n`
    : `#!/usr/bin/env sh\nnode --import "$(dirname "$0")/../../../local-server/scripts/register-esm-loader.mjs" "$(dirname "$0")/../../../local-server/dist/src/index.js" "$@"\n`;

function writeWindowsExeDevWrapper(): boolean {
  if (process.platform !== "win32") {
    return false;
  }

  const vsDevCmd = "C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\Common7\\Tools\\VsDevCmd.bat";
  if (!existsSync(vsDevCmd)) {
    return false;
  }

  const tempDir = mkdtempSync(join(tmpdir(), "lumatrace-sidecar-wrapper-"));
  const sourcePath = resolve(tempDir, "lumatrace-local-server-dev-wrapper.rs");
  const compileScriptPath = resolve(tempDir, "compile.cmd");
  const source = String.raw`
#![cfg_attr(windows, windows_subsystem = "windows")]

use std::{env, path::{Path, PathBuf}, process::{exit, Command}};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn file_url(path: &Path) -> String {
    let mut value = path.to_string_lossy().replace('\\', "/");
    if let Some(stripped) = value.strip_prefix("//?/") {
        value = stripped.to_string();
    }
    if let Some(stripped) = value.strip_prefix("//") {
        value = stripped.to_string();
    }
    format!("file:///{}", value.replace(' ', "%20"))
}

fn normal_path(path: &Path) -> String {
    let mut value = path.to_string_lossy().to_string();
    if let Some(stripped) = value.strip_prefix("\\\\?\\") {
        value = stripped.to_string();
    }
    value
}

fn find_repo_root() -> Option<PathBuf> {
    if let Ok(value) = env::var("LUMATRACE_REPO_ROOT") {
        let path = PathBuf::from(value);
        if path.join("apps").join("local-server").join("dist").join("src").join("index.js").exists() {
            return Some(path);
        }
    }
    let exe = env::current_exe().ok()?;
    let mut cursor = exe.parent()?.to_path_buf();
    for _ in 0..8 {
        if cursor.join("apps").join("local-server").join("dist").join("src").join("index.js").exists() {
            return Some(cursor);
        }
        if !cursor.pop() {
            break;
        }
    }
    None
}

fn main() {
    let Some(root) = find_repo_root() else {
        eprintln!("LumaTrace dev wrapper could not locate apps/local-server/dist/src/index.js");
        exit(1);
    };
    let loader = root.join("apps").join("local-server").join("scripts").join("register-esm-loader.mjs");
    let entry = root.join("apps").join("local-server").join("dist").join("src").join("index.js");
    let mut command = Command::new("node");
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    let status = command
        .arg("--import")
        .arg(file_url(&loader))
        .arg(normal_path(&entry))
        .args(env::args().skip(1))
        .status();
    match status {
        Ok(value) => exit(value.code().unwrap_or(1)),
        Err(error) => {
            eprintln!("LumaTrace dev wrapper failed to start node: {error}");
            exit(1);
        }
    }
}
`;
  writeFileSync(sourcePath, source, "utf8");
  writeFileSync(
    compileScriptPath,
    `@echo off\r\ncall "${vsDevCmd}" -arch=x64 -host_arch=x64 >nul\r\nrustc "${sourcePath}" -O -o "${wrapperPath}"\r\n`,
    "utf8"
  );
  const result = spawnSync("cmd.exe", ["/d", "/c", compileScriptPath], {
    stdio: "inherit",
    windowsHide: true
  });
  const compiled = result.status === 0 && existsSync(wrapperPath);
  rmSync(wrapperPath.replace(/\.exe$/i, ".pdb"), { force: true });
  rmSync(tempDir, { recursive: true, force: true });
  return compiled;
}

if (process.platform === "win32") {
  if (!writeWindowsExeDevWrapper()) {
    throw new Error("Failed to compile Windows sidecar dev-wrapper executable. Install Rust and Visual C++ Build Tools.");
  }
} else {
  writeFileSync(wrapperPath, nodeCommand, "utf8");
}
if (legacyWrapperPath !== wrapperPath) {
  writeFileSync(legacyWrapperPath, nodeCommand, "utf8");
}

const stat = statSync(wrapperPath);
const manifest: SidecarManifest = {
  name: "lumatrace-local-server",
  version: "0.0.0",
  artifactKind: "dev-wrapper",
  platform: process.platform,
  arch: process.arch,
  targetTriple: getSidecarTargetTriple(),
  fileName: wrapperName,
  buildTime: new Date().toISOString(),
  sourcePackageVersion: "0.0.0",
  sha256: hashFile(wrapperPath),
  sizeBytes: stat.size,
  nodeRequired: true,
  productionReady: false,
  limitations: [
    "Development wrapper uses the local Node.js runtime.",
    process.platform === "win32"
      ? "Windows Tauri externalBin uses a small dev wrapper executable that launches local Node.js."
      : "Development wrapper is a shell script and is not a production sidecar.",
    "Production self-contained sidecar is not complete in Milestone 4B.",
    "Do not ship this artifact as a final end-user binary."
  ],
  tauriExternalBin: "lumatrace-local-server"
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Sidecar artifact written to ${wrapperPath}`);
console.log(`Sidecar manifest written to ${manifestPath}`);
