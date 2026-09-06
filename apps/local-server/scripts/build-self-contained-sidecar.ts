import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  rmdirSync,
  statSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { arch, homedir, platform, tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  buildPackagingNoticeManifest,
  getDevWrapperSidecarFileName,
  getSidecarTargetTriple,
  hashFile,
  renderThirdPartyNoticesMarkdown,
  stagePinnedLicenseAssetsForRuntime
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
  runtimePrunedFileCount?: number;
  runtimePrunedSizeBytes?: number;
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
const bundledNodeOverride = process.env.LUMATRACE_BUNDLED_NODE_PATH?.trim();
const bundledNodeSourcePath =
  bundledNodeOverride === undefined || bundledNodeOverride.length === 0
    ? process.execPath
    : resolve(bundledNodeOverride);
const buildTempRoot = (() => {
  const configured = process.env.LUMATRACE_BUILD_TEMP_DIR?.trim();
  const candidate =
    configured !== undefined && configured.length > 0
      ? resolve(configured)
      : process.platform === "win32"
        ? resolve(root, "LumaTraceTemp")
        : tmpdir();
  mkdirSync(candidate, { recursive: true });
  return candidate;
})();
const bundledNodePath = (() => {
  const sourceKey = bundledNodeSourcePath.toLowerCase();
  const runtimeKey = `${runtimeDir.toLowerCase()}${sep}`;
  if (!sourceKey.startsWith(runtimeKey)) {
    return bundledNodeSourcePath;
  }
  const stagedDirectory = mkdtempSync(join(buildTempRoot, "lumatrace-bundled-node-"));
  const stagedNodePath = resolve(stagedDirectory, runtimeNodeName);
  copyFileSync(bundledNodeSourcePath, stagedNodePath);
  console.log(`Staged bundled Node outside the runtime output before replacement: ${stagedNodePath}`);
  return stagedNodePath;
})();

const removableRuntimeDirectoryNames = new Set([
  ".bin",
  ".cache",
  ".circleci",
  ".claude",
  ".github",
  ".gitlab",
  ".nyc_output",
  ".pi",
  ".pnpm",
  ".turbo",
  "bench",
  "benchmark",
  "benchmarks",
  "coverage",
  "doc",
  "docs",
  "example",
  "examples",
  "fixture",
  "fixtures",
  "spec",
  "specs",
  "test",
  "tests",
  "__tests__"
]);
const licenseOrNoticeFilePattern = /^(?:licen[cs]e|notice|copying|copyright)(?:\..*)?$/iu;
const removableRuntimeFileNamePattern =
  /^(?:\.editorconfig|\.eslint.*|\.gitattributes|\.gitignore|\.markdownlint-cli2\.ya?ml|\.modules\.yaml|\.nojekyll|\.npmignore|\.nycrc|\.prettier.*|\.taprc|\.travis\.yml|appveyor\.yml|makefile|package-lock\.json|pnpm-lock\.yaml|tsconfig(?:\..*)?\.json|yarn\.lock)$/iu;
const removableRuntimeSourceFilePattern =
  /(?:\.d\.ts(?:\.map)?|\.[cm]?ts|\.(?:[cm]?js|css)\.map|\.(?:cache|pdb))$/iu;
const removableRuntimeStandaloneDevelopmentFilePattern =
  /^(?:eslint\.config(?:[-_.].*)?|(?:test|tests|bench|benchmark|example|examples|fixture|fixtures|coverage|lint|build)(?:[-_.].*)?|.*\.(?:spec|test|bench|benchmark|example|fixture)(?:\.[^.]+)+)$/iu;
const removedPlatformRuntimeArtifactPattern =
  /(?:^|[^a-z0-9])(?:ios|xctrace|xcrun|idevice[a-z0-9_-]*|simctl)(?=$|[^a-z0-9])/iu;
const removedFirstPartyPlatformTextPattern =
  /(?:^|[^a-z0-9])(?:ios|xctrace|xcrun|idevice[a-z0-9_-]*|simctl)(?=$|[^a-z0-9])|(?:Ios|IOS|iOS|Xctrace|Xcrun|Idevice|Simctl)/u;
const firstPartyRuntimeTextPathPattern = /^(?:dist\/src|node_modules\/@lumatrace\/[^/]+\/dist\/src)\//u;
const runtimeTextFilePattern = /\.(?:cjs|js|json|mjs)$/iu;
const removablePackageArtifactPaths = new Set([
  "node_modules/ajv/.runkit_example.js",
  "node_modules/avvio/.borp.yaml",
  "node_modules/@pinojs/redact/scripts",
  "node_modules/fastify/.borp.yaml",
  "node_modules/fastify/build",
  "node_modules/fastify/integration",
  "node_modules/fastify/scripts",
  "node_modules/fast-json-stringify/build",
  "node_modules/light-my-request/build",
  "node_modules/pino-abstract-transport/.husky",
  "node_modules/pino/build",
  "node_modules/pino/CNAME",
  "node_modules/pino/favicon.ico",
  "node_modules/pino/inc-version.sh",
  "node_modules/pino/index.html",
  "node_modules/secure-json-parse/.airtap.yml",
  "node_modules/semver/range.bnf"
]);

interface RuntimePruneSummary {
  before: { fileCount: number; sizeBytes: number };
  after: { fileCount: number; sizeBytes: number };
  removedFileCount: number;
  removedSizeBytes: number;
}

const deferredRuntimeCleanup: string[] = [];

function clearRuntimeOutputPath(targetPath: string): void {
  try {
    rmSync(targetPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (error) {
    if (!existsSync(targetPath)) {
      return;
    }
    console.warn(
      `Warning: direct runtime cleanup failed; quarantining the old output instead: ${(error as Error).message}`
    );
  }
  if (!existsSync(targetPath)) {
    return;
  }
  const quarantinePath = resolve(
    binariesDir,
    `.lumatrace-runtime-obsolete-${process.pid}-${Date.now()}-${basename(targetPath)}`
  );
  renameSync(targetPath, quarantinePath);
  deferredRuntimeCleanup.push(quarantinePath);
  if (existsSync(targetPath)) {
    throw new Error(`Could not clear previous runtime output: ${targetPath}`);
  }
}

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
  run(bundledNodePath, [pnpmExec, ...args], cwd);
}

function removeDevelopmentOnlyFiles(appDir: string): void {
  for (const relativePath of [
    ".tmp",
    ".turbo",
    "dist/scripts",
    "src",
    "test",
    "tsconfig.json",
    "apps",
    "lumatrace.sqlite",
    "lumatrace.sqlite-shm",
    "lumatrace.sqlite-wal"
  ]) {
    const targetPath = resolve(appDir, relativePath);
    rmSync(targetPath, { recursive: true, force: true });
    if (existsSync(targetPath)) {
      const quarantineDir = mkdtempSync(join(buildTempRoot, "lumatrace-runtime-discard-"));
      const quarantinePath = resolve(quarantineDir, basename(targetPath));
      renameSync(targetPath, quarantinePath);
      try {
        rmSync(quarantineDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch (error) {
        console.warn(`Warning: could not remove quarantined development artifact: ${(error as Error).message}`);
      }
    }
    if (existsSync(targetPath)) {
      throw new Error(`Could not exclude development-only artifact: ${targetPath}`);
    }
  }
}

function runtimeRelativePath(rootDir: string, path: string): string {
  return path.slice(rootDir.length + 1).replace(/\\/gu, "/");
}

function isWorkspaceSourceDirectory(appDir: string, path: string, name: string): boolean {
  return name === "src" && /^node_modules\/@lumatrace\/[^/]+\/src$/u.test(runtimeRelativePath(appDir, path));
}

function isNativeBuildSourceDirectory(appDir: string, path: string, name: string): boolean {
  return (
    (name === "src" || name === "deps") &&
    new RegExp(`^node_modules/better-sqlite3/${name}$`, "u").test(runtimeRelativePath(appDir, path))
  );
}

function isPackageSpecificNonRuntimeArtifact(appDir: string, path: string): boolean {
  return removablePackageArtifactPaths.has(runtimeRelativePath(appDir, path));
}

function shouldRemoveRuntimeFile(appDir: string, path: string, name: string): boolean {
  if (licenseOrNoticeFilePattern.test(name) || name === "package.json" || name.endsWith(".node")) {
    return false;
  }
  const relative = runtimeRelativePath(appDir, path);
  if (relative === "scripts/register-esm-loader.mjs") {
    return false;
  }
  if (relative === "node_modules/better-sqlite3/binding.gyp") {
    return true;
  }
  if (isPackageSpecificNonRuntimeArtifact(appDir, path)) {
    return true;
  }
  return (
    removableRuntimeFileNamePattern.test(name) ||
    removableRuntimeSourceFilePattern.test(name) ||
    removableRuntimeStandaloneDevelopmentFilePattern.test(name) ||
    (/\.(?:md|markdown)$/iu.test(name) && !licenseOrNoticeFilePattern.test(name))
  );
}

function pruneProductionRuntime(appDir: string): RuntimePruneSummary {
  const before = directoryStats(appDir);
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        if (
          removableRuntimeDirectoryNames.has(entry.name.toLowerCase()) ||
          isWorkspaceSourceDirectory(appDir, path, entry.name) ||
          isNativeBuildSourceDirectory(appDir, path, entry.name) ||
          isPackageSpecificNonRuntimeArtifact(appDir, path)
        ) {
          rmSync(path, { recursive: true, force: true });
          continue;
        }
        visit(path);
      } else if (entry.isFile() && shouldRemoveRuntimeFile(appDir, path, entry.name)) {
        rmSync(path, { force: true });
      }
    }
  };
  visit(appDir);
  const after = directoryStats(appDir);
  return {
    before,
    after,
    removedFileCount: before.fileCount - after.fileCount,
    removedSizeBytes: before.sizeBytes - after.sizeBytes
  };
}

function verifyProductionRuntime(appDir: string): void {
  const forbidden: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        if (
          removableRuntimeDirectoryNames.has(entry.name.toLowerCase()) ||
          isWorkspaceSourceDirectory(appDir, path, entry.name) ||
          isNativeBuildSourceDirectory(appDir, path, entry.name) ||
          isPackageSpecificNonRuntimeArtifact(appDir, path)
        ) {
          forbidden.push(runtimeRelativePath(appDir, path));
          continue;
        }
        visit(path);
      } else if (entry.isFile()) {
        const relative = runtimeRelativePath(appDir, path);
        if (
          shouldRemoveRuntimeFile(appDir, path, entry.name) ||
          removedPlatformRuntimeArtifactPattern.test(relative) ||
          (firstPartyRuntimeTextPathPattern.test(relative) &&
            runtimeTextFilePattern.test(entry.name) &&
            removedFirstPartyPlatformTextPattern.test(readFileSync(path, "utf8")))
        ) {
          forbidden.push(relative);
        }
      }
    }
  };
  visit(appDir);
  if (forbidden.length > 0) {
    throw new Error(`Production runtime still contains non-runtime files: ${forbidden.slice(0, 10).join(", ")}`);
  }
  for (const required of [
    "package.json",
    "scripts/register-esm-loader.mjs",
    "dist/src/index.js",
    "node_modules/better-sqlite3/build/Release/better_sqlite3.node",
    "node_modules/better-sqlite3/package.json",
    "node_modules/prebuild-install/help.txt",
    "node_modules/tar-fs/index.js",
    "node_modules/tar-fs/package.json"
  ]) {
    if (!existsSync(resolve(appDir, required))) {
      throw new Error(`Production runtime is missing required file after pruning: ${required}`);
    }
  }
  if (existsSync(resolve(appDir, "node_modules/tar-fs/test/fixtures/invalid.tar"))) {
    throw new Error("Production runtime still contains tar-fs/test/fixtures/invalid.tar.");
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

function copyRuntimeDirectory(source: string, destination: string): void {
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const sourcePath = resolve(source, entry.name);
    const destinationPath = resolve(destination, entry.name);
    if (entry.isDirectory()) {
      copyRuntimeDirectory(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      copyFileSync(sourcePath, destinationPath);
    } else {
      throw new Error(`Production runtime staging contains unsupported link or special file: ${sourcePath}`);
    }
  }
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

  const vsDevCmd = findVisualStudioDevCmd();
  if (!existsSync(vsDevCmd)) {
    throw new Error("Visual C++ Build Tools are required to compile the Windows sidecar wrapper.");
  }

  const tempDir = mkdtempSync(join(buildTempRoot, "lumatrace-self-contained-sidecar-"));
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
    let resource_runtime = sidecar_dir.join("binaries").join("lumatrace-local-server-runtime");
    let resource_node = resource_runtime.join("node.exe");
    let resource_app = resource_runtime.join("app");
    if resource_node.exists() && resource_app.join("dist").join("src").join("index.js").exists() {
        return Some((resource_node, resource_app));
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

function findVisualStudioDevCmd(): string {
  const candidates = [
    "C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\Common7\\Tools\\VsDevCmd.bat",
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\BuildTools\\Common7\\Tools\\VsDevCmd.bat",
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\Enterprise\\Common7\\Tools\\VsDevCmd.bat",
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\Professional\\Common7\\Tools\\VsDevCmd.bat",
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\Common7\\Tools\\VsDevCmd.bat"
  ];
  const vswhere = "C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe";
  if (existsSync(vswhere)) {
    const result = spawnSync(
      vswhere,
      [
        "-latest",
        "-products",
        "*",
        "-requires",
        "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
        "-property",
        "installationPath"
      ],
      {
        encoding: "utf8",
        windowsHide: true
      }
    );
    const installPath = result.stdout.trim().split(/\r?\n/).find(Boolean);
    if (installPath !== undefined) {
      candidates.unshift(resolve(installPath, "Common7/Tools/VsDevCmd.bat"));
    }
  }
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

mkdirSync(binariesDir, { recursive: true });
if (!existsSync(bundledNodePath)) {
  throw new Error(`Bundled Node.js executable does not exist: ${bundledNodePath}`);
}
const requestedNodeVersion = spawnSync(bundledNodePath, ["--version"], {
  encoding: "utf8",
  windowsHide: true
}).stdout.trim();
if (!/^v24\./u.test(requestedNodeVersion)) {
  throw new Error(
    `LumaTrace packaging requires Node.js 24.x so native sidecar modules match the bundled runtime; received ${
      requestedNodeVersion || "unknown"
    }. Set LUMATRACE_BUNDLED_NODE_PATH to a Node.js 24 executable.`
  );
}
clearRuntimeOutputPath(runtimeDir);
mkdirSync(runtimeDir, { recursive: true });

const deployRoot = mkdtempSync(join(buildTempRoot, "lumatrace-runtime-deploy-"));
const deployAppDir = resolve(deployRoot, "app");
const deployLinkRoot =
  process.platform === "win32" && deployRoot.slice(0, 2).toLowerCase() !== root.slice(0, 2).toLowerCase()
    ? resolve(root, ".tmp", `lumatrace-runtime-deploy-link-${process.pid}-${Date.now()}`)
    : undefined;
if (deployLinkRoot !== undefined) {
  mkdirSync(resolve(root, ".tmp"), { recursive: true });
  symlinkSync(deployRoot, deployLinkRoot, "junction");
}
const deployTargetAppDir = resolve(deployLinkRoot ?? deployRoot, "app");
let runtimePrune: RuntimePruneSummary | undefined;
try {
  runPnpm([
    "--filter",
    "@lumatrace/local-server",
    "deploy",
    "--prod",
    "--config.node-linker=hoisted",
    "--config.package-import-method=copy",
    deployTargetAppDir
  ]);
  removeDevelopmentOnlyFiles(deployAppDir);
  breakHardlinkedFiles(deployAppDir);
  runtimePrune = pruneProductionRuntime(deployAppDir);
  verifyProductionRuntime(deployAppDir);
  clearRuntimeOutputPath(runtimeAppDir);
  copyRuntimeDirectory(deployAppDir, runtimeAppDir);
  removeDevelopmentOnlyFiles(runtimeAppDir);
  verifyProductionRuntime(runtimeAppDir);
} finally {
  if (deployLinkRoot !== undefined && existsSync(deployLinkRoot)) {
    rmdirSync(deployLinkRoot);
  }
  rmSync(deployRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
copyFileSync(bundledNodePath, runtimeNodePath);
compileWrapper();
removeDevelopmentOnlyFiles(runtimeAppDir);
verifyProductionRuntime(runtimeAppDir);

const wrapperStat = statSync(wrapperPath);
const nodeVersion = spawnSync(runtimeNodePath, ["--version"], {
  encoding: "utf8",
  windowsHide: true
}).stdout.trim();
stagePinnedLicenseAssetsForRuntime({
  repositoryRoot: root,
  runtimeDir,
  bundledNodeVersion: nodeVersion
});
const noticeManifest = buildPackagingNoticeManifest({
  runtimeAppDir,
  runtimeDir,
  bundledNodeVersion: nodeVersion,
  artifactKind: "self-contained",
  productionReady: false
});
writeFileSync(noticesPath, `${JSON.stringify(noticeManifest, null, 2)}\n`, "utf8");
writeFileSync(thirdPartyNoticesPath, renderThirdPartyNoticesMarkdown(noticeManifest), "utf8");
removeDevelopmentOnlyFiles(runtimeAppDir);
const runtime = directoryStats(runtimeDir);
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
  ...(runtimePrune === undefined
    ? {}
    : {
        runtimePrunedFileCount: runtimePrune.removedFileCount,
        runtimePrunedSizeBytes: runtimePrune.removedSizeBytes
      }),
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

for (const forbiddenPath of [resolve(runtimeAppDir, ".tmp"), resolve(runtimeAppDir, "lumatrace.sqlite")]) {
  if (existsSync(forbiddenPath)) {
    throw new Error(`Self-contained runtime contains development-only artifact: ${forbiddenPath}`);
  }
}

console.log(`Self-contained sidecar wrapper written to ${wrapperPath}`);
console.log(`Bundled runtime written to ${runtimeDir}`);
console.log(`Packaging notices written to ${noticesPath}`);
console.log(`Third-party notices written to ${thirdPartyNoticesPath}`);
console.log(`Sidecar manifest written to ${manifestPath}`);
if (runtimePrune !== undefined) {
  console.log(
    `Production runtime pruned ${runtimePrune.removedFileCount} files and ${runtimePrune.removedSizeBytes} bytes ` +
      `(${runtimePrune.before.fileCount} files/${runtimePrune.before.sizeBytes} bytes -> ` +
      `${runtimePrune.after.fileCount} files/${runtimePrune.after.sizeBytes} bytes).`
  );
}
for (const obsoletePath of deferredRuntimeCleanup) {
  try {
    rmSync(obsoletePath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    if (existsSync(obsoletePath)) {
      console.warn(`Warning: obsolete runtime output remains outside the packaged runtime: ${obsoletePath}`);
    }
  } catch (error) {
    console.warn(`Warning: could not remove obsolete runtime output: ${(error as Error).message}`);
  }
}
console.log("productionReady=false remains intentional.");
