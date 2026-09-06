import assert from "node:assert/strict";
import test from "node:test";
import {
  assertPackageResourceModel,
  extractManifestResourceLanguages,
  renderPackageResourceLanguages
} from "./windows-store-package-resources.ts";

const literalManifest = (languages: readonly string[]): string => `
<Package>
  <Properties><DisplayName>LumaTrace Performance Lab</DisplayName></Properties>
  <Resources>
${renderPackageResourceLanguages(languages)}
  </Resources>
</Package>`;

test("accepts the literal en-US package resource model", () => {
  const manifestText = literalManifest(["en-US"]);
  assert.deepEqual(extractManifestResourceLanguages(manifestText), ["en-US"]);
  assert.doesNotThrow(() =>
    assertPackageResourceModel({
      packageResourceLanguages: ["en-US"],
      manifestText,
      resourcesPriExists: false
    })
  );
});

test("rejects application JSON locales copied into MSIX resource declarations", () => {
  const manifestText = literalManifest(["en-US", "zh-CN"]);
  assert.throws(
    () =>
      assertPackageResourceModel({
        packageResourceLanguages: ["en-US", "zh-CN"],
        manifestText,
        resourcesPriExists: false
      }),
    /application JSON locales and Store listing locales are tracked separately/u
  );
});

test("requires resources.pri when the manifest uses an MRM resource URI", () => {
  const manifestText = literalManifest(["en-US"]).replace(
    "LumaTrace Performance Lab",
    "ms-resource:AppDisplayName"
  );
  assert.throws(
    () =>
      assertPackageResourceModel({
        packageResourceLanguages: ["en-US"],
        manifestText,
        resourcesPriExists: false
      }),
    /no root resources\.pri/u
  );
});
