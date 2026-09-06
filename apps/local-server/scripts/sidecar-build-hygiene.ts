import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync
} from "node:fs";
import { basename, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const sidecarBuildOutputDirectories = [
  "apps/local-server/dist",
  "packages/core/dist",
  "packages/storage/dist",
  "packages/report/dist",
  "packages/collectors/android/dist",
  "packages/collectors/ios/dist",
  "packages/collectors/mock/dist",
  "packages/collectors/pc/dist"
] as const;

const textualBuildArtifactExtensions = new Set([".cjs", ".js", ".json", ".map", ".mjs", ".ts"]);
const removedPlatformArtifactPattern =
  /(?:^|[^a-z0-9])(?:ios|xctrace|xcrun|idevice[a-z0-9_-]*|simctl)(?=$|[^a-z0-9])/iu;
const removedPlatformTextArtifactPattern =
  /(?:^|[^a-z0-9])(?:ios|xctrace|xcrun|idevice[a-z0-9_-]*|simctl)(?=$|[^a-z0-9])|(?:Ios|IOS|iOS|Xctrace|Xcrun|Idevice|Simctl)/u;

function normalizedPath(path: string): string {
  const absolute = resolve(path);
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}

function resolveBuildOutput(repositoryRoot: string, relativePath: string): string {
  const root = resolve(repositoryRoot);
  const target = resolve(root, relativePath);
  const relativeTarget = relative(root, target);
  if (
    relativeTarget.length === 0 ||
    relativeTarget.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    relativeTarget === ".." ||
    isAbsolute(relativeTarget) ||
    basename(target).toLowerCase() !== "dist"
  ) {
    throw new Error(`Unsafe sidecar build output path: ${target}`);
  }
  const expected = resolve(root, ...relativePath.split("/"));
  if (normalizedPath(target) !== normalizedPath(expected)) {
    throw new Error(`Unexpected sidecar build output path: ${target}`);
  }
  return target;
}

function visitFiles(directory: string, onFile: (path: string) => void): void {
  if (!existsSync(directory)) {
    return;
  }
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      visitFiles(path, onFile);
    } else if (entry.isFile()) {
      onFile(path);
    }
  }
}

export function cleanSidecarBuildOutputs(repositoryRoot: string): string[] {
  const removed: string[] = [];
  for (const relativePath of sidecarBuildOutputDirectories) {
    const output = resolveBuildOutput(repositoryRoot, relativePath);
    rmSync(output, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    if (existsSync(output)) {
      throw new Error(`Could not clean stale sidecar build output: ${output}`);
    }
    removed.push(relativePath);
  }
  return removed;
}

export function scanRemovedPlatformBuildArtifacts(repositoryRoot: string): string[] {
  const matches = new Set<string>();
  for (const relativePath of sidecarBuildOutputDirectories) {
    const output = resolveBuildOutput(repositoryRoot, relativePath);
    const productionOutput = resolve(output, "src");
    visitFiles(productionOutput, (path) => {
      const distributionPath = relative(resolve(repositoryRoot), path).replace(/\\/gu, "/");
      if (removedPlatformArtifactPattern.test(distributionPath)) {
        matches.add(distributionPath);
        return;
      }
      if (!textualBuildArtifactExtensions.has(extname(path).toLowerCase()) || statSync(path).size === 0) {
        return;
      }
      if (removedPlatformTextArtifactPattern.test(readFileSync(path, "utf8"))) {
        matches.add(distributionPath);
      }
    });
  }
  return [...matches].sort();
}

export function assertNoRemovedPlatformBuildArtifacts(repositoryRoot: string): void {
  const matches = scanRemovedPlatformBuildArtifacts(repositoryRoot);
  if (matches.length > 0) {
    throw new Error(
      `Removed platform artifacts remain in production build output: ${matches.slice(0, 20).join(", ")}`
    );
  }
}

function runCli(): void {
  const repositoryRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
  if (process.argv.includes("--clean")) {
    const removed = cleanSidecarBuildOutputs(repositoryRoot);
    console.log(`Cleaned ${removed.length} explicit sidecar dist outputs.`);
    return;
  }
  if (process.argv.includes("--assert")) {
    assertNoRemovedPlatformBuildArtifacts(repositoryRoot);
    console.log("Sidecar production build outputs contain no removed-platform artifacts.");
    return;
  }
  throw new Error("Expected --clean or --assert.");
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && normalizedPath(invokedPath) === normalizedPath(fileURLToPath(import.meta.url))) {
  runCli();
}
