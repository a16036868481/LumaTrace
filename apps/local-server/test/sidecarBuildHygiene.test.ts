import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  assertNoRemovedPlatformBuildArtifacts,
  cleanSidecarBuildOutputs,
  scanRemovedPlatformBuildArtifacts,
  sidecarBuildOutputDirectories
} from "../scripts/sidecar-build-hygiene.js";

const temporaryRoots: string[] = [];

function temporaryRoot(): string {
  const configured = process.env.LUMATRACE_BUILD_TEMP_DIR?.trim();
  const base =
    configured !== undefined && configured.length > 0
      ? resolve(configured)
      : tmpdir();
  mkdirSync(base, { recursive: true });
  const root = mkdtempSync(join(base, "lumatrace-sidecar-hygiene-test-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("sidecar build hygiene", () => {
  it("cleans only the explicit dist outputs and preserves workspace source", () => {
    const root = temporaryRoot();
    const sourceSentinel = join(root, "apps/local-server/src/keep.ts");
    mkdirSync(join(root, "apps/local-server/src"), { recursive: true });
    writeFileSync(sourceSentinel, "export const keep = true;\n", "utf8");
    for (const relativeOutput of sidecarBuildOutputDirectories) {
      const output = resolve(root, relativeOutput);
      mkdirSync(output, { recursive: true });
      writeFileSync(join(output, "stale.js"), "stale\n", "utf8");
    }

    expect(cleanSidecarBuildOutputs(root)).toEqual([...sidecarBuildOutputDirectories]);
    expect(existsSync(sourceSentinel)).toBe(true);
    for (const relativeOutput of sidecarBuildOutputDirectories) {
      expect(existsSync(resolve(root, relativeOutput))).toBe(false);
    }
  });

  it("rejects removed-platform artifacts in production dist output", () => {
    const root = temporaryRoot();
    const removedRouteName = ["i", "os.js"].join("");
    const routeDirectory = join(root, "apps/local-server/dist/src/routes");
    mkdirSync(routeDirectory, { recursive: true });
    writeFileSync(join(routeDirectory, removedRouteName), "export {};\n", "utf8");
    const pcOutput = join(root, "packages/collectors/pc/dist/src");
    mkdirSync(pcOutput, { recursive: true });
    writeFileSync(join(pcOutput, "tool.js"), `export const tool = "${["xc", "trace"].join("")}";\n`, "utf8");
    const reportOutput = join(root, "packages/report/dist/src");
    mkdirSync(reportOutput, { recursive: true });
    writeFileSync(join(reportOutput, "tool.js"), `export const tool = "${["xc", "run"].join("")}";\n`, "utf8");
    const localServerOutput = join(root, "apps/local-server/dist/src/services");
    mkdirSync(localServerOutput, { recursive: true });
    const removedCamelCaseSymbol = ["import", "Ios", "TraceCsv"].join("");
    writeFileSync(
      join(localServerOutput, "legacy.js"),
      `export const legacy = "${removedCamelCaseSymbol}";\n`,
      "utf8"
    );

    expect(scanRemovedPlatformBuildArtifacts(root)).toEqual([
      "apps/local-server/dist/src/routes/ios.js",
      "apps/local-server/dist/src/services/legacy.js",
      "packages/collectors/pc/dist/src/tool.js",
      "packages/report/dist/src/tool.js"
    ]);
    expect(() => assertNoRemovedPlatformBuildArtifacts(root)).toThrow(
      /Removed platform artifacts remain in production build output/u
    );
  });
});
