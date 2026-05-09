import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, delimiter, relative, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";

interface TauriConfig {
  bundle?: {
    active?: boolean;
  };
}

interface SidecarManifest {
  artifactKind?: string;
  nodeRequired?: boolean;
  productionReady?: boolean;
  sha256?: string;
  fileName?: string;
}

interface DraftArtifact {
  fileName: string;
  relativePath: string;
  sizeBytes: number;
  sha256: string;
}

interface InstallerDraftManifest {
  schemaVersion: 1;
  generatedAt: string;
  status: "success" | "failed";
  bundleKind: "windows-nsis-installer-draft";
  bundleTarget: "nsis";
  platform: NodeJS.Platform;
  arch: NodeJS.Architecture;
  unsigned: true;
  installerBuilt: boolean;
  productionReady: false;
  codeSigningConfigured: false;
  updaterConfigured: false;
  configOverrideFile: string;
  sidecarManifest: {
    fileName?: string;
    artifactKind?: string;
    nodeRequired?: boolean;
    productionReady?: boolean;
    sha256?: string;
  };
  installerArtifacts: DraftArtifact[];
  build: {
    exitCode: number | null;
    stdoutExcerptSanitized: string;
    stderrExcerptSanitized: string;
  };
  limitations: string[];
}

const root = process.cwd();
const desktopDir = resolve(root, "apps/desktop");
const tauriDir = resolve(desktopDir, "src-tauri");
const tauriConfigPath = resolve(tauriDir, "tauri.conf.json");
const releaseDir = resolve(tauriDir, "target/release");
const nsisDir = resolve(releaseDir, "bundle/nsis");
const draftDir = resolve(tauriDir, "target/installer-draft");
const draftConfigPath = resolve(draftDir, "tauri.installer-draft.conf.json");
const installerDraftManifestPath = resolve(releaseDir, "lumatrace-installer-draft-manifest.json");
const sidecarManifestPath = resolve(tauriDir, "binaries/sidecar-manifest.json");

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function artifactInfo(path: string): DraftArtifact {
  return {
    fileName: basename(path),
    relativePath: relative(releaseDir, path).replace(/\\/gu, "/"),
    sizeBytes: statSync(path).size,
    sha256: sha256(path)
  };
}

function sanitizeText(input: string): string {
  return input
    .replaceAll(root, "<workspace>")
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

function listInstallerArtifacts(): DraftArtifact[] {
  if (!existsSync(nsisDir)) {
    return [];
  }
  return readdirSync(nsisDir, { recursive: true })
    .map((entry) => resolve(nsisDir, String(entry)))
    .filter((path) => existsSync(path) && statSync(path).isFile() && /\.exe$/iu.test(path))
    .map(artifactInfo);
}

function writeManifest(manifest: InstallerDraftManifest): void {
  mkdirSync(releaseDir, { recursive: true });
  writeFileSync(installerDraftManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function windowsBuildEnv(baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const cargoBin = process.env.USERPROFILE === undefined ? undefined : resolve(process.env.USERPROFILE, ".cargo/bin");
  const appDataNpm = process.env.APPDATA === undefined ? undefined : resolve(process.env.APPDATA, "npm");
  const desktopBin = resolve(desktopDir, "node_modules/.bin");
  const pathParts = [cargoBin, appDataNpm, desktopBin, baseEnv.PATH].filter((value): value is string => value !== undefined);
  const env = { ...baseEnv, PATH: pathParts.join(delimiter) };
  const vsDevCmd = "C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\Common7\\Tools\\VsDevCmd.bat";
  if (process.platform !== "win32" || !existsSync(vsDevCmd)) {
    return env;
  }

  const result = spawnSync("cmd.exe", ["/d", "/c", `call "${vsDevCmd}" -arch=x64 -host_arch=x64 >nul && set`], {
    encoding: "utf8",
    env,
    windowsHide: true
  });
  if (result.status !== 0) {
    return env;
  }

  const nextEnv = { ...env };
  for (const line of result.stdout.split(/\r?\n/u)) {
    const index = line.indexOf("=");
    if (index > 0) {
      nextEnv[line.slice(0, index)] = line.slice(index + 1);
    }
  }
  nextEnv.PATH = [cargoBin, appDataNpm, desktopBin, nextEnv.PATH].filter((value): value is string => value !== undefined).join(delimiter);
  return nextEnv;
}

async function runTauriInstallerDraft(): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  const args = ["exec", "tauri", "build", "--config", draftConfigPath, "--bundles", "nsis", "--no-sign", "--ci"];
  return await new Promise((resolvePromise) => {
    const draftConfigArg = relative(desktopDir, draftConfigPath).replace(/\\/gu, "/");
    const windowsCommand = `pnpm exec tauri build --config ${draftConfigArg} --bundles nsis --no-sign --ci`;
    const child =
      process.platform === "win32"
        ? spawn("cmd.exe", ["/d", "/c", windowsCommand], {
            cwd: desktopDir,
            env: windowsBuildEnv(process.env),
            windowsHide: false
          })
        : spawn("pnpm", args, {
            cwd: desktopDir,
            env: windowsBuildEnv(process.env)
          });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderr += text;
      process.stderr.write(text);
    });
    child.on("error", (error) => {
      resolvePromise({ exitCode: 1, stdout, stderr: `${stderr}\n${error.name}: ${error.message}` });
    });
    child.on("exit", (exitCode) => resolvePromise({ exitCode, stdout, stderr }));
  });
}

const baseConfig = readJson<TauriConfig>(tauriConfigPath);
if (baseConfig.bundle?.active !== false) {
  console.error("Refusing to run installer draft because default tauri.conf.json must keep bundle.active=false.");
  process.exit(1);
}

if (process.platform !== "win32") {
  console.error("Windows installer draft can only run on Windows.");
  process.exit(1);
}

mkdirSync(draftDir, { recursive: true });
writeFileSync(
  draftConfigPath,
  `${JSON.stringify(
    {
      bundle: {
        active: true,
        targets: ["nsis"]
      }
    },
    null,
    2
  )}\n`,
  "utf8"
);

if (existsSync(nsisDir)) {
  rmSync(nsisDir, { recursive: true, force: true });
}

const sidecarManifest = existsSync(sidecarManifestPath) ? readJson<SidecarManifest>(sidecarManifestPath) : {};
const result = await runTauriInstallerDraft();
const installerArtifacts = listInstallerArtifacts();
const success = result.exitCode === 0 && installerArtifacts.length > 0;

const manifest: InstallerDraftManifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  status: success ? "success" : "failed",
  bundleKind: "windows-nsis-installer-draft",
  bundleTarget: "nsis",
  platform: process.platform,
  arch: process.arch,
  unsigned: true,
  installerBuilt: success,
  productionReady: false,
  codeSigningConfigured: false,
  updaterConfigured: false,
  configOverrideFile: "target/installer-draft/tauri.installer-draft.conf.json",
  sidecarManifest: {
    fileName: sidecarManifest.fileName,
    artifactKind: sidecarManifest.artifactKind,
    nodeRequired: sidecarManifest.nodeRequired,
    productionReady: sidecarManifest.productionReady,
    sha256: sidecarManifest.sha256
  },
  installerArtifacts,
  build: {
    exitCode: result.exitCode,
    stdoutExcerptSanitized: excerpt(result.stdout),
    stderrExcerptSanitized: excerpt(result.stderr)
  },
  limitations: [
    "This is an unsigned NSIS installer draft for QA only.",
    "No code signing, updater, notarization, store distribution, or production release approval is configured.",
    "productionReady remains false until signing, installer QA, license notice review, and release checks are complete.",
    "The default tauri.conf.json keeps bundle.active=false; this script uses a temporary config override."
  ]
};

writeManifest(manifest);

if (!success) {
  console.error(`Windows installer draft failed. Manifest written to ${installerDraftManifestPath}`);
  process.exit(1);
}

console.log(`Windows installer draft manifest written to ${installerDraftManifestPath}`);
