import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { arch, homedir, platform, tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  buildPackagingNoticeManifest,
  getDevWrapperSidecarFileName,
  getSidecarTargetTriple,
  hashFile,
  renderThirdPartyNoticesMarkdown
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
  runtimeDirectory?: string;
  runtimeSizeBytes?: number;
  runtimeFileCount?: number;
  bundledNodeVersion?: string;
  noticesFile?: string;
  noticesSha256?: string;
  thirdPartyNoticesFile?: string;
  thirdPartyNoticesSha256?: string;
  licenseReviewStatus?: "draft_requires_review" | "complete";
}

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const binariesDir = resolve(root, "apps/desktop/src-tauri/binaries");
const runtimeDirName = "lumatrace-local-server-runtime";
const runtimeDir = resolve(binariesDir, runtimeDirName);
const runtimeAppDir = resolve(runtimeDir, "app");
const runtimeNodeName = process.platform === "win32" ? "node.exe" : "node";
const runtimeNodePath = resolve(runtimeDir, runtimeNodeName);
const wrapperName = getDevWrapperSidecarFileName();
const wrapperPath = resolve(binariesDir, wrapperName);
const manifestPath = resolve(binariesDir, "sidecar-manifest.json");
const noticesFileName = "packaging-notices.json";
const noticesPath = resolve(binariesDir, noticesFileName);
const thirdPartyNoticesFileName = "THIRD-PARTY-NOTICES.md";
const thirdPartyNoticesPath = resolve(binariesDir, thirdPartyNoticesFileName);

function run(command: string, args: string[], cwd = root): void {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    windowsHide: true
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}${
        result.error === undefined ? "" : `: ${result.error.message}`
      }`
    );
  }
}

function runPnpm(args: string[], cwd = root): void {
  const pnpmExec =
    process.env.npm_execpath ??
    resolve(process.env.APPDATA ?? resolve(homedir(), "AppData/Roaming"), "npm/node_modules/pnpm/bin/pnpm.cjs");
  run(process.execPath, [pnpmExec, ...args], cwd);
}

function removeDevelopmentOnlyFiles(appDir: string): void {
  for (const relativePath of [".turbo", "src", "test", "tsconfig.json", "apps"]) {
    rmSync(resolve(appDir, relativePath), { recursive: true, force: true });
  }
}

function breakHardlinkedFiles(directory: string): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      breakHardlinkedFiles(path);
    } else if (entry.isFile()) {
      const stat = statSync(path);
      if (stat.nlink > 1) {
        const copyPath = resolve(directory, `.lumatrace-copy-${process.pid}-${Date.now()}-${entry.name}`);
        copyFileSync(path, copyPath);
        rmSync(path, { force: true });
        renameSync(copyPath, path);
      }
    }
  }
}

function directoryStats(directory: string): { fileCount: number; sizeBytes: number } {
  let fileCount = 0;
  let sizeBytes = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      const child = directoryStats(path);
      fileCount += child.fileCount;
      sizeBytes += child.sizeBytes;
    } else if (entry.isFile()) {
      fileCount += 1;
      sizeBytes += statSync(path).size;
    }
  }
  return { fileCount, sizeBytes };
}

function compileWrapper(): void {
  if (process.platform !== "win32") {
    const shellWrapper = `#!/usr/bin/env sh
set -eu
DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
RUNTIME="$DIR/${runtimeDirName}"
NODE="$RUNTIME/${runtimeNodeName}"
APP="$RUNTIME/app"
if [ ! -x "$NODE" ]; then
  echo "LumaTrace self-contained sidecar is missing bundled Node runtime." >&2
  exit 1
fi
exec "$NODE" --import "file://$APP/scripts/register-esm-loader.mjs" "$APP/dist/src/index.js" "$@"
`;
    writeFileSync(wrapperPath, shellWrapper, { encoding: "utf8", mode: 0o755 });
    return;
  }

  const vsDevCmd = "C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\Common7\\Tools\\VsDevCmd.bat";
  if (!existsSync(vsDevCmd)) {
    throw new Error("Visual C++ Build Tools are required to compile the Windows sidecar wrapper.");
  }

  const tempDir = mkdtempSync(join(tmpdir(), "lumatrace-self-contained-sidecar-"));
  const sourcePath = resolve(tempDir, "lumatrace-local-server-wrapper.rs");
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

fn sidecar_dir() -> Option<PathBuf> {
    Some(env::current_exe().ok()?.parent()?.to_path_buf())
}

fn find_runtime_app(sidecar_dir: &Path) -> Option<(PathBuf, PathBuf)> {
    if let Ok(value) = env::var("LUMATRACE_SIDECAR_RUNTIME_DIR") {
        let runtime = PathBuf::from(value);
        let node = runtime.join("node.exe");
        let app = runtime.join("app");
        if node.exists() && app.join("dist").join("src").join("index.js").exists() {
            return Some((node, app));
        }
    }
    let runtime = sidecar_dir.join("lumatrace-local-server-runtime");
    let node = runtime.join("node.exe");
    let app = runtime.join("app");
    if node.exists() && app.join("dist").join("src").join("index.js").exists() {
        return Some((node, app));
    }
    None
}

fn find_repo_app() -> Option<(PathBuf, PathBuf)> {
    if let Ok(value) = env::var("LUMATRACE_REPO_ROOT") {
        let root = PathBuf::from(value);
        let app = root.join("apps").join("local-server");
        if app.join("dist").join("src").join("index.js").exists() {
            return Some((PathBuf::from("node"), app));
        }
    }
    let exe = env::current_exe().ok()?;
    let mut cursor = exe.parent()?.to_path_buf();
    for _ in 0..8 {
        let app = cursor.join("apps").join("local-server");
        if app.join("dist").join("src").join("index.js").exists() {
            return Some((PathBuf::from("node"), app));
        }
        if !cursor.pop() {
            break;
        }
    }
    None
}

fn main() {
    let candidate = sidecar_dir()
        .and_then(|dir| find_runtime_app(&dir))
        .or_else(find_repo_app);
    let Some((node, app)) = candidate else {
        eprintln!("LumaTrace sidecar could not locate bundled runtime or development app.");
        exit(1);
    };
    let loader = app.join("scripts").join("register-esm-loader.mjs");
    let entry = app.join("dist").join("src").join("index.js");
    let mut command = Command::new(node);
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
            eprintln!("LumaTrace sidecar failed to start: {error}");
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
  try {
    run("cmd.exe", ["/d", "/c", compileScriptPath], root);
  } finally {
    rmSync(wrapperPath.replace(/\.exe$/i, ".pdb"), { force: true });
    try {
      rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (error) {
      console.warn(`Warning: could not remove temporary wrapper build directory: ${(error as Error).message}`);
    }
  }
}

mkdirSync(binariesDir, { recursive: true });
rmSync(runtimeDir, { recursive: true, force: true });
mkdirSync(runtimeDir, { recursive: true });

const deployRoot = mkdtempSync(join(tmpdir(), "lumatrace-runtime-deploy-"));
const deployAppDir = resolve(deployRoot, "app");
try {
  runPnpm([
    "--filter",
    "@lumatrace/local-server",
    "deploy",
    "--prod",
    "--config.node-linker=hoisted",
    "--config.package-import-method=copy",
    deployAppDir
  ]);
  removeDevelopmentOnlyFiles(deployAppDir);
  breakHardlinkedFiles(deployAppDir);
  try {
    renameSync(deployAppDir, runtimeAppDir);
  } catch {
    cpSync(deployAppDir, runtimeAppDir, { recursive: true });
  }
} finally {
  rmSync(deployRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
copyFileSync(process.execPath, runtimeNodePath);
compileWrapper();

const wrapperStat = statSync(wrapperPath);
const runtime = directoryStats(runtimeDir);
const nodeVersion = spawnSync(runtimeNodePath, ["--version"], {
  encoding: "utf8",
  windowsHide: true
}).stdout.trim();
const noticeManifest = buildPackagingNoticeManifest({
  runtimeAppDir,
  bundledNodeVersion: nodeVersion,
  artifactKind: "self-contained",
  productionReady: false
});
writeFileSync(noticesPath, `${JSON.stringify(noticeManifest, null, 2)}\n`, "utf8");
writeFileSync(thirdPartyNoticesPath, renderThirdPartyNoticesMarkdown(noticeManifest), "utf8");
const manifest: SidecarManifest = {
  name: "lumatrace-local-server",
  version: "0.0.0",
  artifactKind: "self-contained",
  platform: platform() as NodeJS.Platform,
  arch: arch() as NodeJS.Architecture,
  targetTriple: getSidecarTargetTriple(),
  fileName: basename(wrapperPath),
  buildTime: new Date().toISOString(),
  sourcePackageVersion: "0.0.0",
  sha256: hashFile(wrapperPath),
  sizeBytes: wrapperStat.size,
  nodeRequired: false,
  productionReady: false,
  runtimeDirectory: runtimeDirName,
  runtimeSizeBytes: runtime.sizeBytes,
  runtimeFileCount: runtime.fileCount,
  bundledNodeVersion: nodeVersion,
  noticesFile: noticesFileName,
  noticesSha256: hashFile(noticesPath),
  thirdPartyNoticesFile: thirdPartyNoticesFileName,
  thirdPartyNoticesSha256: hashFile(thirdPartyNoticesPath),
  licenseReviewStatus: "draft_requires_review",
  limitations: [
    "This sidecar includes a bundled Node.js runtime and a pnpm deploy production dependency closure.",
    "It is a self-contained draft for local verification, not a signed production release.",
    "Production readiness remains false until signing, installer QA, license notice review, and release smoke are complete.",
    "Third-party notice files are generated for review but do not make this artifact production-ready.",
    "Do not claim updater, notarization, or store distribution support for this artifact."
  ],
  tauriExternalBin: "lumatrace-local-server"
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(`Self-contained sidecar wrapper written to ${wrapperPath}`);
console.log(`Bundled runtime written to ${runtimeDir}`);
console.log(`Packaging notices written to ${noticesPath}`);
console.log(`Third-party notices written to ${thirdPartyNoticesPath}`);
console.log(`Sidecar manifest written to ${manifestPath}`);
console.log("productionReady=false remains intentional.");
