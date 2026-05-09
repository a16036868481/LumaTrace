import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getDevWrapperSidecarFileName,
  getSelfContainedSidecarFileName,
  getSidecarTargetTriple,
  hashFile,
  readSidecarManifest
} from "../dist/src/diagnostics/packagedDiagnostics.js";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const binariesDir = resolve(root, "apps/desktop/src-tauri/binaries");
const manifestPath = resolve(binariesDir, "sidecar-manifest.json");

function check(name: string, passed: boolean): void {
  console.log(`${passed ? "[ok]" : "[fail]"} ${name}`);
  if (!passed) {
    process.exitCode = 1;
  }
}

const validation = readSidecarManifest(manifestPath);
check("sidecar manifest exists and validates", validation.valid);
if (validation.reason !== undefined) {
  console.log(`reason: ${validation.reason}`);
}

const manifest = validation.manifest;
if (manifest !== undefined) {
  check("manifest has artifactKind", manifest.artifactKind === "dev-wrapper" || manifest.artifactKind === "self-contained");
  check("manifest target triple matches platform", manifest.targetTriple === getSidecarTargetTriple(manifest.platform, manifest.arch));
  check("manifest declares productionReady boolean", typeof manifest.productionReady === "boolean");
  check("manifest does not claim production ready for dev wrapper", manifest.artifactKind !== "dev-wrapper" || manifest.productionReady === false);
  check("manifest declares node requirement", typeof manifest.nodeRequired === "boolean");
  check("manifest fileName is target-mapped", manifest.fileName === getDevWrapperSidecarFileName(manifest.platform, manifest.arch) || manifest.fileName === getSelfContainedSidecarFileName(manifest.platform, manifest.arch));
  check("manifest contains no token", !JSON.stringify(manifest).toLowerCase().includes("token"));
  if (manifest.artifactKind === "self-contained") {
    const runtimeDir = resolve(binariesDir, manifest.runtimeDirectory ?? "");
    const runtimeNode = resolve(runtimeDir, manifest.platform === "win32" ? "node.exe" : "node");
    const runtimeEntry = resolve(runtimeDir, "app/dist/src/index.js");
    const noticesPath =
      manifest.noticesFile === undefined ? undefined : resolve(binariesDir, manifest.noticesFile);
    const thirdPartyNoticesPath =
      manifest.thirdPartyNoticesFile === undefined
        ? undefined
        : resolve(binariesDir, manifest.thirdPartyNoticesFile);
    check("self-contained manifest declares nodeRequired=false", manifest.nodeRequired === false);
    check("self-contained manifest keeps productionReady=false until release QA", manifest.productionReady === false);
    check("self-contained runtime directory exists", manifest.runtimeDirectory !== undefined && existsSync(runtimeDir));
    check("self-contained runtime includes bundled node", existsSync(runtimeNode));
    check("self-contained runtime includes local-server entry", existsSync(runtimeEntry));
    check("self-contained runtime has file count", typeof manifest.runtimeFileCount === "number" && manifest.runtimeFileCount > 0);
    check("self-contained runtime has size", typeof manifest.runtimeSizeBytes === "number" && manifest.runtimeSizeBytes > 0);
    check("self-contained manifest declares license review status", manifest.licenseReviewStatus === "draft_requires_review");
    check("self-contained packaging notices exist", noticesPath !== undefined && existsSync(noticesPath));
    check(
      "self-contained packaging notices hash matches",
      noticesPath !== undefined &&
        typeof manifest.noticesSha256 === "string" &&
        existsSync(noticesPath) &&
        manifest.noticesSha256 === hashFile(noticesPath)
    );
    check("self-contained third-party notices exist", thirdPartyNoticesPath !== undefined && existsSync(thirdPartyNoticesPath));
    check(
      "self-contained third-party notices hash matches",
      thirdPartyNoticesPath !== undefined &&
        typeof manifest.thirdPartyNoticesSha256 === "string" &&
        existsSync(thirdPartyNoticesPath) &&
        manifest.thirdPartyNoticesSha256 === hashFile(thirdPartyNoticesPath)
    );
  }
}

const tauriConfig = readFileSync(resolve(root, "apps/desktop/src-tauri/tauri.conf.json"), "utf8");
check("Tauri config has externalBin mapping", /externalBin/.test(tauriConfig) && /lumatrace-local-server/.test(tauriConfig));
check("legacy dev wrapper exists for 4A compatibility", existsSync(resolve(binariesDir, process.platform === "win32" ? "lumatrace-local-server-dev.cmd" : "lumatrace-local-server-dev")));


if (process.exitCode === 1) {
  console.error("Sidecar artifact verification failed");
} else {
  console.log("Sidecar artifact verification passed");
}
