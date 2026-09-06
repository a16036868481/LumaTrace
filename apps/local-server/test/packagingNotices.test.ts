import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  PINNED_LICENSE_ASSETS,
  buildPackagingNoticeManifest,
  renderThirdPartyNoticesMarkdown,
  stagePinnedLicenseAssetsForRuntime
} from "../src/diagnostics/packagingNotices";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const temporaryRoots: string[] = [];

function pinnedLicenseAsset(componentName: "Node.js" | "abstract-logging") {
  const asset = PINNED_LICENSE_ASSETS.find((entry) => entry.componentName === componentName);
  if (asset === undefined) {
    throw new Error(`Missing pinned license asset specification for ${componentName}`);
  }
  return asset;
}

function temporaryRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hashFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function writePackage(
  packageDir: string,
  options: {
    name: string;
    version: string;
    license?: string;
    licenseText?: string;
  }
): void {
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(
    join(packageDir, "package.json"),
    `${JSON.stringify({
      name: options.name,
      version: options.version,
      ...(options.license === undefined ? {} : { license: options.license })
    })}\n`,
    "utf8"
  );
  if (options.licenseText !== undefined) {
    writeFileSync(join(packageDir, "LICENSE"), options.licenseText, "utf8");
  }
}

function createRepresentativeRuntime(): { runtimeDir: string; runtimeAppDir: string } {
  const runtimeDir = temporaryRoot("lumatrace-license-runtime-");
  const runtimeAppDir = join(runtimeDir, "app");
  const nodeModulesDir = join(runtimeAppDir, "node_modules");

  writePackage(join(nodeModulesDir, "ajv"), {
    name: "ajv",
    version: "8.17.1",
    license: "MIT",
    licenseText: "ajv MIT license"
  });
  writePackage(join(nodeModulesDir, "ajv", "node_modules", "fast-uri"), {
    name: "fast-uri",
    version: "3.1.5",
    license: "BSD-3-Clause",
    licenseText: "fast-uri BSD license"
  });
  writePackage(join(nodeModulesDir, "light-my-request"), {
    name: "light-my-request",
    version: "6.6.0",
    license: "BSD-3-Clause",
    licenseText: "light-my-request BSD license"
  });
  writePackage(join(nodeModulesDir, "light-my-request", "node_modules", "process-warning"), {
    name: "process-warning",
    version: "4.0.1",
    license: "MIT",
    licenseText: "process-warning MIT license"
  });
  writePackage(join(nodeModulesDir, "thread-stream"), {
    name: "thread-stream",
    version: "3.1.0",
    license: "MIT",
    licenseText: "thread-stream MIT license"
  });
  writePackage(join(nodeModulesDir, "thread-stream", "node_modules", "real-require"), {
    name: "real-require",
    version: "1.0.0",
    license: "MIT",
    licenseText: "real-require MIT license"
  });
  writePackage(join(nodeModulesDir, "abstract-logging"), {
    name: "abstract-logging",
    version: "2.0.1",
    license: "MIT"
  });

  writePackage(join(nodeModulesDir, "ajv", "examples", "not-a-package-root"), {
    name: "example-only-package",
    version: "1.0.0",
    license: "MIT",
    licenseText: "not distributed as a package root"
  });
  writePackage(join(nodeModulesDir, "ajv", "test", "fixtures", "not-a-package-root"), {
    name: "fixture-only-package",
    version: "1.0.0",
    license: "MIT",
    licenseText: "not distributed as a package root"
  });
  writePackage(join(nodeModulesDir, "thread-stream", "benchmark", "not-a-package-root"), {
    name: "benchmark-only-package",
    version: "1.0.0",
    license: "MIT",
    licenseText: "not distributed as a package root"
  });

  return { runtimeDir, runtimeAppDir };
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root !== undefined) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("packaging license notices", () => {
  it("finds true nested package roots and binds every retained license file", () => {
    const { runtimeDir, runtimeAppDir } = createRepresentativeRuntime();
    const nodeAsset = pinnedLicenseAsset("Node.js");
    const abstractLoggingAsset = pinnedLicenseAsset("abstract-logging");
    const stagedAssets = stagePinnedLicenseAssetsForRuntime({
      repositoryRoot,
      runtimeDir,
      bundledNodeVersion: "v24.14.0"
    });

    expect(stagedAssets).toHaveLength(2);
    for (const asset of stagedAssets) {
      const stagedPath = resolve(runtimeDir, asset.distributionPath);
      expect(existsSync(stagedPath)).toBe(true);
      expect(hashFile(stagedPath)).toBe(asset.sha256);
    }

    const manifest = buildPackagingNoticeManifest({
      runtimeAppDir,
      runtimeDir,
      bundledNodeVersion: "v24.14.0",
      artifactKind: "self-contained",
      productionReady: false,
      generatedAt: new Date(0).toISOString()
    });

    expect(manifest.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "fast-uri",
          version: "3.1.5",
          packagePath: "node_modules/ajv/node_modules/fast-uri",
          reviewStatus: "recorded"
        }),
        expect.objectContaining({
          name: "process-warning",
          version: "4.0.1",
          packagePath: "node_modules/light-my-request/node_modules/process-warning",
          reviewStatus: "recorded"
        }),
        expect.objectContaining({
          name: "real-require",
          version: "1.0.0",
          packagePath: "node_modules/thread-stream/node_modules/real-require",
          reviewStatus: "recorded"
        })
      ])
    );
    expect(manifest.entries.map((entry) => entry.name)).not.toEqual(
      expect.arrayContaining([
        "example-only-package",
        "fixture-only-package",
        "benchmark-only-package"
      ])
    );

    const nodeEntry = manifest.entries.find((entry) => entry.name === "Node.js");
    expect(nodeEntry).toMatchObject({
      version: "v24.14.0",
      reviewStatus: "recorded",
      noticeFiles: [
        expect.objectContaining({
          distributionPath: "lumatrace-local-server-runtime/NODE-LICENSE.txt",
          sha256: nodeAsset.sha256,
          source: "pinned-license-asset"
        })
      ]
    });
    const abstractLoggingEntry = manifest.entries.find(
      (entry) => entry.name === "abstract-logging" && entry.version === "2.0.1"
    );
    expect(abstractLoggingEntry).toMatchObject({
      reviewStatus: "recorded",
      noticeFiles: [
        expect.objectContaining({
          distributionPath:
            "lumatrace-local-server-runtime/THIRD-PARTY-LICENSES/abstract-logging-2.0.1-LICENSE.txt",
          sha256: abstractLoggingAsset.sha256,
          source: "pinned-license-asset"
        })
      ]
    });
    expect(manifest.summary).toMatchObject({
      totalComponents: 8,
      packageCount: 7,
      runtimeCount: 1,
      missingLicenseCount: 0,
      missingNoticeFileCount: 0,
      draftReviewRequired: true
    });
    expect(manifest.productionReady).toBe(false);
    expect(manifest.licenseReviewStatus).toBe("draft_requires_review");

    const fastUriLicenseText = "fast-uri BSD license";
    const markdown = renderThirdPartyNoticesMarkdown(manifest);
    expect(markdown).toContain("## License file bindings");
    expect(markdown).toContain("lumatrace-local-server-runtime/NODE-LICENSE.txt");
    expect(markdown).toContain(nodeAsset.sha256);
    expect(markdown).toContain(
      "lumatrace-local-server-runtime/app/node_modules/ajv/node_modules/fast-uri/LICENSE"
    );
    expect(markdown).toContain(hashText(fastUriLicenseText));
    expect(markdown).not.toContain("**MISSING**");
  });

  it("fails closed when a pinned license asset has been changed", () => {
    const fakeRepositoryRoot = temporaryRoot("lumatrace-tampered-license-");
    const runtimeDir = temporaryRoot("lumatrace-tampered-runtime-");
    const nodeAsset = pinnedLicenseAsset("Node.js");
    const sourcePath = resolve(fakeRepositoryRoot, nodeAsset.repositoryPath);
    mkdirSync(resolve(sourcePath, ".."), { recursive: true });
    writeFileSync(sourcePath, "tampered license", "utf8");

    expect(() =>
      stagePinnedLicenseAssetsForRuntime({
        repositoryRoot: fakeRepositoryRoot,
        runtimeDir,
        bundledNodeVersion: "v24.14.0"
      })
    ).toThrow(`Pinned license asset hash mismatch: ${nodeAsset.repositoryPath}`);
  });

  it("refuses to stage a license for a different Node.js runtime version", () => {
    const runtimeDir = temporaryRoot("lumatrace-node-version-mismatch-");

    expect(() =>
      stagePinnedLicenseAssetsForRuntime({
        repositoryRoot,
        runtimeDir,
        bundledNodeVersion: "v24.14.1"
      })
    ).toThrow("No pinned Node.js license asset matches bundled runtime v24.14.1");
    expect(existsSync(join(runtimeDir, "NODE-LICENSE.txt"))).toBe(false);
  });

  it("keeps engineering provenance and vendored asset hashes in sync", () => {
    const provenance = JSON.parse(
      readFileSync(join(repositoryRoot, "legal", "third-party", "provenance.json"), "utf8")
    ) as {
      schemaVersion: number;
      assets: Array<Record<string, string>>;
    };

    expect(provenance.schemaVersion).toBe(1);
    expect(provenance.assets).toHaveLength(2);
    for (const assetSpec of PINNED_LICENSE_ASSETS) {
      const provenanceAsset = provenance.assets.find(
        (asset) =>
          asset.component === assetSpec.componentName &&
          asset.version === assetSpec.componentVersion
      );
      expect(provenanceAsset).toMatchObject({
        repositoryPath: assetSpec.repositoryPath,
        sha256: assetSpec.sha256
      });
      expect(hashFile(resolve(repositoryRoot, assetSpec.repositoryPath))).toBe(assetSpec.sha256);
    }

    const nodeProvenance = provenance.assets.find((asset) => asset.component === "Node.js");
    const abstractLoggingProvenance = provenance.assets.find(
      (asset) => asset.component === "abstract-logging"
    );
    expect(nodeProvenance).toMatchObject({
      component: "Node.js",
      version: "v24.14.0",
      tagObject: "a3d5b4bca68d85dcb67d527b05409795f69c66e7",
      commit: "f657bb8ed86365ff3fdbe32e27563e778b41486a",
      sourceUrl:
        "https://raw.githubusercontent.com/nodejs/node/f657bb8ed86365ff3fdbe32e27563e778b41486a/LICENSE"
    });
    expect(abstractLoggingProvenance).toMatchObject({
      component: "abstract-logging",
      version: "2.0.1",
      commit: "80dfaef91ee87008f4ed2b6e78921d383bccd406",
      archivedLicenseSnapshot:
        "https://web.archive.org/web/20200922004843id_/https://jsumners.mit-license.org/",
      copyrightRegistryCommit: "73ebb8ca1e2280883e92498e18fcdb1c633c226c"
    });

    const abstractLoggingAsset = pinnedLicenseAsset("abstract-logging");
    const abstractLicense = readFileSync(
      resolve(repositoryRoot, abstractLoggingAsset.repositoryPath),
      "utf8"
    );
    expect(abstractLicense).toContain("Copyright © 2020 James Sumners");
    expect(abstractLicense).toContain(
      "THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND"
    );
  });
});
