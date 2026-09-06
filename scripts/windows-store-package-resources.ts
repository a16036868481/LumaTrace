export const DEFAULT_PACKAGE_RESOURCE_LANGUAGE = "en-US";

export interface PackageResourceModel {
  packageResourceLanguages: readonly string[];
  manifestText: string;
  resourcesPriExists: boolean;
}

export function extractManifestResourceLanguages(manifestText: string): string[] {
  return [...manifestText.matchAll(/<Resource\s+Language="([^"]+)"\s*\/>/gu)].map(
    (match) => match[1] ?? ""
  );
}

export function renderPackageResourceLanguages(languages: readonly string[]): string {
  return languages.map((language) => `    <Resource Language="${language}" />`).join("\n");
}

/**
 * LumaTrace localizes its UI with bundled JSON dictionaries. It does not use
 * Windows MRM resources for those strings, and its package manifest contains
 * literal English metadata. Keep the MSIX resource declaration separate from
 * the application's runtime language catalog so the package never advertises
 * Windows resource payloads that it does not contain.
 */
export function assertPackageResourceModel(model: PackageResourceModel): void {
  const languages = [...model.packageResourceLanguages];
  if (
    languages.length !== 1 ||
    languages[0] !== DEFAULT_PACKAGE_RESOURCE_LANGUAGE ||
    new Set(languages).size !== languages.length
  ) {
    throw new Error(
      `MSIX package resources must be exactly ${DEFAULT_PACKAGE_RESOURCE_LANGUAGE}; ` +
        "application JSON locales and Store listing locales are tracked separately."
    );
  }

  const manifestLanguages = extractManifestResourceLanguages(model.manifestText);
  if (JSON.stringify(manifestLanguages) !== JSON.stringify(languages)) {
    throw new Error(
      `AppxManifest resource languages (${manifestLanguages.join(", ")}) do not match ` +
        `the package resource model (${languages.join(", ")}).`
    );
  }

  const usesMrmResourceUris = /\bms-resource:/iu.test(model.manifestText);
  if (usesMrmResourceUris && !model.resourcesPriExists) {
    throw new Error("AppxManifest uses ms-resource URIs but the package has no root resources.pri.");
  }
  if (!usesMrmResourceUris && model.resourcesPriExists) {
    throw new Error("The literal-only AppxManifest unexpectedly includes resources.pri.");
  }
}
