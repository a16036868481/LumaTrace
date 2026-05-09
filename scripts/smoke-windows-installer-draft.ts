import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { spawn } from "node:child_process";

interface InstallerDraftManifest {
  status?: string;
  unsigned?: boolean;
  installerBuilt?: boolean;
  productionReady?: boolean;
  installerArtifacts?: Array<{
    relativePath: string;
    sha256: string;
    sizeBytes: number;
  }>;
}

interface SmokeCommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

interface InstalledFile {
  label: string;
  relativePath: string;
  sizeBytes: number;
  sha256: string;
}

interface InstallerSmokeManifest {
  schemaVersion: 1;
  generatedAt: string;
  status: "success" | "failed";
  installMode: "nsis-silent-temp-dir";
  unsigned: true;
  productionReady: false;
  installerArtifact: {
    relativePath: string;
    sizeBytes: number;
    sha256: string;
  };
  installDirSanitized: "<temp-install-dir>";
  installedFiles: InstalledFile[];
  uninstalled: boolean;
  install: {
    exitCode: number | null;
    stdoutExcerptSanitized: string;
    stderrExcerptSanitized: string;
  };
  uninstall: {
    exitCode: number | null;
    stdoutExcerptSanitized: string;
    stderrExcerptSanitized: string;
  };
  warnings: string[];
  limitations: string[];
}

const root = process.cwd();
const releaseDir = resolve(root, "apps/desktop/src-tauri/target/release");
const installerDraftManifestPath = resolve(releaseDir, "lumatrace-installer-draft-manifest.json");
const installerSmokeManifestPath = resolve(releaseDir, "lumatrace-installer-smoke-manifest.json");
const smokeRoot = resolve(tmpdir(), `lumatrace-installer-smoke-${process.pid}-${randomBytes(3).toString("hex")}`);
const installDir = resolve(smokeRoot, "install");

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sanitizeText(input: string): string {
  return input
    .replaceAll(root, "<workspace>")
    .replaceAll(smokeRoot, "<installer-smoke-temp>")
    .replace(/[A-Z]:\\Users\\[^\\\r\n]+(?:\\[^\r\n\s"]*)*/giu, "<local-path>")
    .replace(/\/(?:Users|home)\/[^\s"']+/giu, "<local-path>")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gu, "Bearer <redacted>")
    .replace(/lumatrace-auth\.[A-Za-z0-9._~+/=-]+/gu, "lumatrace-auth.<redacted>")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, "<email>");
}

function excerpt(input: string): string {
  const sanitized = sanitizeText(input);
  return sanitized.length > 4096 ? `${sanitized.slice(0, 4096)}\n<truncated>` : sanitized;
}

function runCommand(executable: string, args: string[], cwd: string): Promise<SmokeCommandResult> {
  return new Promise((resolvePromise) => {
    const child = spawn(executable, args, {
      cwd,
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      resolvePromise({ exitCode: 1, stdout, stderr: `${stderr}\n${error.name}: ${error.message}` });
    });
    child.on("exit", (exitCode) => {
      resolvePromise({ exitCode, stdout, stderr });
    });
  });
}

async function waitUntil(predicate: () => boolean, timeoutMs: number, intervalMs: number): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    if (predicate()) {
      return true;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, intervalMs));
  }
  return predicate();
}

function walkFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function findFile(files: string[], predicate: (file: string) => boolean): string | undefined {
  return files.find(predicate);
}

function installedFile(label: string, path: string): InstalledFile {
  return {
    label,
    relativePath: relative(installDir, path).replace(/\\/gu, "/"),
    sizeBytes: statSync(path).size,
    sha256: sha256(path)
  };
}

function writeSmokeManifest(manifest: InstallerSmokeManifest): void {
  mkdirSync(dirname(installerSmokeManifestPath), { recursive: true });
  writeFileSync(installerSmokeManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function assertCleanManifest(path: string): void {
  const text = readFileSync(path, "utf8");
  const checks: Array<[string, boolean]> = [
    ["no bearer token", !/Bearer\s+[A-Za-z0-9._~+/=-]+/u.test(text)],
    ["no auth subprotocol token", !/lumatrace-auth\.[A-Za-z0-9._~+/=-]+/u.test(text)],
    ["no local user path", !/[A-Z]:\\Users\\|\/(?:Users|home)\//iu.test(text)],
    ["no productionReady true", !/"productionReady"\s*:\s*true/u.test(text)]
  ];
  for (const [name, passed] of checks) {
    if (!passed) {
      throw new Error(`Installer smoke manifest failed sanitizer check: ${name}`);
    }
  }
}

if (process.platform !== "win32") {
  console.error("Windows installer smoke can only run on Windows.");
  process.exit(1);
}

if (!existsSync(installerDraftManifestPath)) {
  console.error("Installer draft manifest is missing. Run pnpm verify:windows-installer-draft first.");
  process.exit(1);
}

const draftManifest = readJson<InstallerDraftManifest>(installerDraftManifestPath);
const artifact = draftManifest.installerArtifacts?.[0];
if (
  draftManifest.status !== "success" ||
  draftManifest.unsigned !== true ||
  draftManifest.installerBuilt !== true ||
  draftManifest.productionReady !== false ||
  artifact === undefined
) {
  console.error("Installer draft manifest is not a successful unsigned draft.");
  process.exit(1);
}

const installerPath = resolve(releaseDir, artifact.relativePath);
if (!existsSync(installerPath) || sha256(installerPath) !== artifact.sha256 || statSync(installerPath).size !== artifact.sizeBytes) {
  console.error("Installer artifact is missing or does not match the draft manifest.");
  process.exit(1);
}

rmSync(smokeRoot, { recursive: true, force: true });
mkdirSync(installDir, { recursive: true });

const warnings: string[] = [];
let installResult: SmokeCommandResult = { exitCode: 1, stdout: "", stderr: "" };
let uninstallResult: SmokeCommandResult = { exitCode: 1, stdout: "", stderr: "" };
let installedFiles: InstalledFile[] = [];
let uninstalled = false;

try {
  installResult = await runCommand(installerPath, ["/S", `/D=${installDir}`], releaseDir);
  if (installResult.exitCode !== 0) {
    throw new Error(`Silent installer exited with ${installResult.exitCode ?? "unknown"}`);
  }

  const files = walkFiles(installDir);
  const appExe = findFile(files, (file) => /LumaTrace\.exe$/iu.test(file) || /lumatrace-desktop\.exe$/iu.test(file));
  const sidecarExe = findFile(files, (file) => /lumatrace-local-server(?:-[\w-]+)?\.exe$/iu.test(basename(file)));
  const sidecarManifest = findFile(files, (file) => basename(file) === "sidecar-manifest.json");
  const packagingNotices = findFile(files, (file) => basename(file) === "packaging-notices.json");
  const thirdPartyNotices = findFile(files, (file) => basename(file) === "THIRD-PARTY-NOTICES.md");
  const bundledNode = findFile(files, (file) => basename(file).toLowerCase() === "node.exe");
  const uninstaller = findFile(files, (file) => /uninstall.*\.exe$/iu.test(basename(file)));

  const required = [
    ["app executable", appExe],
    ["sidecar executable", sidecarExe],
    ["sidecar manifest", sidecarManifest],
    ["packaging notices", packagingNotices],
    ["third-party notices", thirdPartyNotices],
    ["bundled node", bundledNode],
    ["uninstaller", uninstaller]
  ] as const;

  for (const [label, path] of required) {
    if (path === undefined) {
      throw new Error(`Installed ${label} was not found`);
    }
    installedFiles.push(installedFile(label, path));
  }

  uninstallResult = await runCommand(uninstaller as string, ["/S", `_?=${installDir}`], installDir);
  if (uninstallResult.exitCode !== 0) {
    warnings.push(`Silent uninstaller exited with ${uninstallResult.exitCode ?? "unknown"}`);
  }
  uninstalled = await waitUntil(() => !existsSync(appExe as string) || !existsSync(installDir), 15_000, 500);

  if (!uninstalled) {
    warnings.push("Install directory still exists after uninstall; cleanup removed the temporary directory.");
  }
} catch (error) {
  warnings.push(error instanceof Error ? error.message : String(error));
} finally {
  const status: InstallerSmokeManifest["status"] =
    installResult.exitCode === 0 && installedFiles.length >= 7 && uninstallResult.exitCode === 0 && uninstalled ? "success" : "failed";
  const smokeManifest: InstallerSmokeManifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status,
    installMode: "nsis-silent-temp-dir",
    unsigned: true,
    productionReady: false,
    installerArtifact: {
      relativePath: artifact.relativePath,
      sizeBytes: artifact.sizeBytes,
      sha256: artifact.sha256
    },
    installDirSanitized: "<temp-install-dir>",
    installedFiles,
    uninstalled,
    install: {
      exitCode: installResult.exitCode,
      stdoutExcerptSanitized: excerpt(installResult.stdout),
      stderrExcerptSanitized: excerpt(installResult.stderr)
    },
    uninstall: {
      exitCode: uninstallResult.exitCode,
      stdoutExcerptSanitized: excerpt(uninstallResult.stdout),
      stderrExcerptSanitized: excerpt(uninstallResult.stderr)
    },
    warnings,
    limitations: [
      "This smoke installs the unsigned NSIS draft into a temporary directory only.",
      "It does not run production signing, updater validation, store distribution, or release approval.",
      "productionReady remains false."
    ]
  };
  writeSmokeManifest(smokeManifest);
  assertCleanManifest(installerSmokeManifestPath);
  rmSync(smokeRoot, { recursive: true, force: true });
  if (smokeManifest.status !== "success") {
    console.error(`Windows installer draft smoke failed. Manifest written to ${installerSmokeManifestPath}`);
    process.exit(1);
  }
}

console.log(`Windows installer draft smoke manifest written to ${installerSmokeManifestPath}`);
console.log("Windows installer draft smoke passed");
