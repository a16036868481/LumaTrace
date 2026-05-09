import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

interface InstallerArtifact {
  fileName?: string;
  relativePath: string;
  sizeBytes: number;
  sha256: string;
}

interface InstallerDraftManifest {
  status?: string;
  unsigned?: boolean;
  productionReady?: boolean;
  codeSigningConfigured?: boolean;
  updaterConfigured?: boolean;
  installerArtifacts?: InstallerArtifact[];
  sidecarManifest?: {
    artifactKind?: string;
    nodeRequired?: boolean;
    productionReady?: boolean;
  };
}

interface Options {
  tag: string;
  repo?: string;
  publish: boolean;
  skipChecks: boolean;
  skipGitCheck: boolean;
  skipAppLaunchSmoke: boolean;
}

const root = process.cwd();
const releaseDir = resolve(root, "apps/desktop/src-tauri/target/release");
const installerManifestPath = resolve(releaseDir, "lumatrace-installer-draft-manifest.json");
const installerSmokeManifestPath = resolve(releaseDir, "lumatrace-installer-smoke-manifest.json");
const appLaunchSmokeManifestPath = resolve(releaseDir, "lumatrace-installed-app-launch-smoke-manifest.json");
const sidecarHealthSmokeManifestPath = resolve(releaseDir, "lumatrace-installed-sidecar-health-smoke-manifest.json");

function usage(): void {
  console.log(`Usage:
  pnpm release:windows-preview -- --tag v0.1.0-preview.2 --publish
  pnpm release:windows-preview -- --tag v0.1.0-preview.2 --dry-run

Options:
  --tag <tag>                 Required release tag, for example v0.1.0-preview.2.
  --repo <owner/repo>         Optional GitHub repository. Defaults to git remote origin.
  --publish                   Create and push a git tag, then create a GitHub prerelease.
  --dry-run                   Build and stage assets, but do not create a tag or release.
  --skip-checks               Skip the release verification command sequence.
  --skip-git-check            Do not require a clean git tree before publishing.
  --skip-app-launch-smoke     Skip the installed app launch smoke; sidecar health still runs.
`);
}

function parseOptions(): Options {
  const options: Options = {
    tag: "",
    publish: false,
    skipChecks: false,
    skipGitCheck: false,
    skipAppLaunchSmoke: false
  };
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    if (arg === "--tag") {
      options.tag = args[index + 1] ?? "";
      index += 1;
    } else if (arg === "--repo") {
      options.repo = args[index + 1];
      index += 1;
    } else if (arg === "--publish") {
      options.publish = true;
    } else if (arg === "--dry-run") {
      options.publish = false;
    } else if (arg === "--skip-checks") {
      options.skipChecks = true;
    } else if (arg === "--skip-git-check") {
      options.skipGitCheck = true;
    } else if (arg === "--skip-app-launch-smoke") {
      options.skipAppLaunchSmoke = true;
    } else {
      console.error(`Unknown option: ${arg}`);
      usage();
      process.exit(1);
    }
  }

  if (!/^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(options.tag)) {
    console.error("A semver release tag is required, for example --tag v0.1.0-preview.2");
    process.exit(1);
  }
  return options;
}

function run(command: string, args: string[], label: string, options: { cwd?: string; allowFailure?: boolean } = {}): string {
  console.log(`\n> ${label}`);
  const result = spawnSync(toExecutable(command), args, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: false
  });

  if (result.stdout.length > 0) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr.length > 0) {
    process.stderr.write(result.stderr);
  }

  if (!options.allowFailure && result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}`);
  }
  return result.stdout.trim();
}

function runInherited(command: string, args: string[], label: string): void {
  console.log(`\n> ${label}`);
  const result = spawnSync(toExecutable(command), args, {
    cwd: root,
    stdio: "inherit",
    shell: false
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}`);
  }
}

function runPnpm(args: string[], label: string): void {
  runInherited("pnpm", args, label);
}

function runNodeScript(script: string, label: string): void {
  runInherited("node", ["--experimental-strip-types", script], label);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function toExecutable(command: string): string {
  if (process.platform !== "win32") {
    return command;
  }
  if (command === "pnpm") {
    return "pnpm.cmd";
  }
  if (command === "node") {
    return process.execPath;
  }
  if (command === "gh") {
    return "gh.exe";
  }
  if (command === "git") {
    return "git.exe";
  }
  return command;
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function copyAsset(source: string, destination: string): string {
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
  return destination;
}

function cleanTag(tag: string): string {
  return tag.replace(/[^0-9A-Za-z._-]/gu, "-");
}

function normalizeRepoFromRemote(remoteUrl: string): string | undefined {
  const trimmed = remoteUrl.trim().replace(/\.git$/u, "");
  const sshMatch = /^git@github\.com:([^/]+\/[^/]+)$/u.exec(trimmed);
  if (sshMatch !== null) {
    return sshMatch[1];
  }
  const httpsMatch = /^https:\/\/github\.com\/([^/]+\/[^/]+)$/u.exec(trimmed);
  return httpsMatch?.[1];
}

function getRepo(explicitRepo: string | undefined): string {
  if (explicitRepo !== undefined && explicitRepo.length > 0) {
    return explicitRepo;
  }
  const remote = run("git", ["remote", "get-url", "origin"], "read git remote origin");
  const repo = normalizeRepoFromRemote(remote);
  if (repo === undefined) {
    throw new Error(`Could not derive owner/repo from origin: ${remote}`);
  }
  return repo;
}

function assertGitClean(): void {
  const status = run("git", ["status", "--porcelain"], "check git status");
  if (status.length > 0) {
    throw new Error(`Refusing to publish from a dirty worktree:\n${status}`);
  }
}

function ensureTagDoesNotExist(tag: string): void {
  const local = spawnSync(toExecutable("git"), ["rev-parse", "--verify", `refs/tags/${tag}`], {
    cwd: root,
    encoding: "utf8",
    shell: false
  });
  if (local.status === 0) {
    throw new Error(`Local tag already exists: ${tag}`);
  }
}

function assertGhAvailable(repo: string): void {
  run("gh", ["--version"], "check GitHub CLI");
  run("gh", ["auth", "status", "--hostname", "github.com"], "check GitHub auth");
  run("gh", ["repo", "view", repo, "--json", "nameWithOwner"], "check GitHub repository access");
}

function runReleaseChecks(skipAppLaunchSmoke: boolean): void {
  const packageScripts = [
    "install",
    "test",
    "typecheck",
    "lint",
    "build:desktop",
    "smoke:mvp-a",
    "verify:mvp-a",
    "smoke:mvp-b-ui",
    "smoke:mvp-b-browser",
    "test:android-collector",
    "verify:android-beta",
    "test:pc-collector",
    "verify:pc-foundation",
    "verify:presentmon-adapter",
    "verify:pc-beta",
    "build:sidecar",
    "smoke:tauri-foundation",
    "verify:tauri-foundation",
    "detect:tauri-toolchain",
    "build:self-contained-sidecar",
    "verify:sidecar-artifacts",
    "smoke:packaging-diagnostics",
    "smoke:packaged-storage",
    "smoke:sidecar-crash-recovery",
    "verify:packaging-hardening",
    "check:tauri",
    "build:tauri",
    "verify:windows-installer-draft"
  ];

  for (const script of packageScripts) {
    runPnpm([script], `pnpm ${script}`);
  }

  runNodeScript("scripts/smoke-windows-installer-draft.ts", "smoke unsigned installer install/uninstall");
  if (!skipAppLaunchSmoke) {
    runNodeScript("scripts/smoke-windows-installed-app-launch.ts", "smoke installed app launch");
  }
  runNodeScript("scripts/smoke-windows-installed-sidecar-health.ts", "smoke installed sidecar health");
  runPnpm(["verify:windows-preview-release"], "pnpm verify:windows-preview-release");
}

function readInstallerArtifact(): { manifest: InstallerDraftManifest; installerPath: string; artifact: InstallerArtifact } {
  if (!existsSync(installerManifestPath)) {
    throw new Error("Installer manifest is missing. Run pnpm verify:windows-installer-draft first.");
  }
  const manifest = readJson<InstallerDraftManifest>(installerManifestPath);
  if (
    manifest.status !== "success" ||
    manifest.unsigned !== true ||
    manifest.productionReady !== false ||
    manifest.codeSigningConfigured !== false ||
    manifest.updaterConfigured !== false
  ) {
    throw new Error("Installer draft manifest is not an unsigned non-production preview manifest.");
  }
  const artifact = manifest.installerArtifacts?.find((item) => /\.exe$/iu.test(item.relativePath));
  if (artifact === undefined) {
    throw new Error("Installer draft manifest does not record an .exe artifact.");
  }
  const installerPath = resolve(releaseDir, artifact.relativePath);
  if (!existsSync(installerPath)) {
    throw new Error(`Installer artifact is missing: ${artifact.relativePath}`);
  }
  if (sha256(installerPath) !== artifact.sha256) {
    throw new Error("Installer artifact hash does not match the draft manifest.");
  }
  return { manifest, installerPath, artifact };
}

function copyIfPresent(stageDir: string, source: string, destinationFileName: string): string | undefined {
  if (!existsSync(source)) {
    return undefined;
  }
  return copyAsset(source, resolve(stageDir, destinationFileName));
}

function writeReleaseNotes(
  stageDir: string,
  tag: string,
  installerFileName: string,
  manifest: InstallerDraftManifest,
  artifact: InstallerArtifact
): string {
  const notesPath = resolve(stageDir, "release-notes.md");
  const sidecarKind = manifest.sidecarManifest?.artifactKind ?? "unknown";
  const sidecarNodeRequired = String(manifest.sidecarManifest?.nodeRequired ?? "unknown");
  const notes = `# LumaTrace Windows Preview ${tag}

This is an unsigned Windows preview installer for QA and early local testing.

## What Is Included

- Windows NSIS setup executable: \`${installerFileName}\`
- Self-contained sidecar draft status: \`${sidecarKind}\`
- Sidecar nodeRequired: \`${sidecarNodeRequired}\`
- Installer SHA-256: \`${artifact.sha256}\`
- Installer size: \`${artifact.sizeBytes}\` bytes

## Important Limitations

- This is a prerelease preview, not a production release.
- The installer is unsigned and may trigger Microsoft SmartScreen.
- Code signing is not complete.
- Auto-updater is not configured.
- Store distribution is not configured.
- \`productionReady\` remains \`false\`.
- Optional Android ADB and PresentMon workflows still depend on tool availability and system permissions.
- Missing metrics stay N/A and are not filled with 0.

## 中文说明

这是 Windows 预览安装包，用于早期试用和 QA。它不是正式生产发布。

- 安装包未签名，Windows 可能会显示 SmartScreen 提示。
- 当前没有自动更新、商店发布或正式代码签名。
- sidecar 已随安装包打入草案形态，但发布状态仍然是 \`productionReady=false\`。
- Android / Windows FPS 等能力仍会遵守工具、权限和平台限制；采不到的数据会显示 N/A，不会造假。
`;
  writeFileSync(notesPath, notes, "utf8");
  return notesPath;
}

function stageReleaseAssets(tag: string): { stageDir: string; assets: string[]; notesPath: string } {
  const { manifest, installerPath, artifact } = readInstallerArtifact();
  const safeTag = cleanTag(tag);
  const stageDir = resolve(releaseDir, "github-preview", safeTag);
  const installerFileName = `LumaTrace-${safeTag}-windows-x64-setup.exe`;
  const assets = [
    copyAsset(installerPath, resolve(stageDir, installerFileName)),
    copyAsset(installerManifestPath, resolve(stageDir, "lumatrace-windows-installer-manifest.json"))
  ];

  for (const [source, fileName] of [
    [installerSmokeManifestPath, "lumatrace-installer-smoke-manifest.json"],
    [appLaunchSmokeManifestPath, "lumatrace-installed-app-launch-smoke-manifest.json"],
    [sidecarHealthSmokeManifestPath, "lumatrace-installed-sidecar-health-smoke.json"]
  ] as const) {
    const copied = copyIfPresent(stageDir, source, fileName);
    if (copied !== undefined) {
      assets.push(copied);
    }
  }

  const notesPath = writeReleaseNotes(stageDir, tag, installerFileName, manifest, artifact);
  const releaseManifestPath = resolve(stageDir, "lumatrace-windows-preview-release-manifest.json");
  writeFileSync(
    releaseManifestPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        releaseKind: "windows-preview-github-release",
        tag,
        unsigned: true,
        productionReady: false,
        codeSigningConfigured: false,
        updaterConfigured: false,
        installer: {
          fileName: installerFileName,
          sourceFileName: basename(installerPath),
          sizeBytes: statSync(installerPath).size,
          sha256: artifact.sha256
        },
        sidecarManifest: manifest.sidecarManifest,
        assets: assets.map((assetPath) => basename(assetPath)),
        notesFile: basename(notesPath),
        limitations: [
          "Unsigned prerelease preview only.",
          "No code signing, updater, notarization, store distribution, or production release approval is configured.",
          "productionReady remains false."
        ]
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  assets.push(releaseManifestPath);

  return { stageDir, assets, notesPath };
}

function publishRelease(tag: string, repo: string, assets: string[], notesPath: string): void {
  run("git", ["tag", tag], `create git tag ${tag}`);
  run("git", ["push", "origin", `refs/tags/${tag}`], `push git tag ${tag}`);
  run(
    "gh",
    [
      "release",
      "create",
      tag,
      ...assets,
      "--repo",
      repo,
      "--title",
      `LumaTrace Windows Preview ${tag}`,
      "--notes-file",
      notesPath,
      "--prerelease"
    ],
    `create GitHub prerelease ${tag}`
  );
}

const options = parseOptions();
const repo = getRepo(options.repo);

if (options.publish && !options.skipGitCheck) {
  assertGitClean();
  ensureTagDoesNotExist(options.tag);
  assertGhAvailable(repo);
}

if (!options.skipChecks) {
  runReleaseChecks(options.skipAppLaunchSmoke);
}

const staged = stageReleaseAssets(options.tag);
console.log(`\nStaged Windows preview release assets in ${staged.stageDir}`);
for (const asset of staged.assets) {
  console.log(`- ${basename(asset)}`);
}
console.log(`- ${basename(staged.notesPath)}`);

if (options.publish) {
  publishRelease(options.tag, repo, staged.assets, staged.notesPath);
  console.log(`Published ${options.tag} to https://github.com/${repo}/releases/tag/${options.tag}`);
} else {
  console.log("Dry run complete. Re-run with --publish to create the git tag and GitHub prerelease.");
}
