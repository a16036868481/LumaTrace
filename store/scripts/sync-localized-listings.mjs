import console from "node:console";
import fs from "node:fs/promises";
import path from "node:path";
import { URL, fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const catalogSource = await fs.readFile(
  path.join(repositoryRoot, "apps", "desktop", "src", "i18n", "localeCatalog.ts"),
  "utf8",
);
const locales = [...catalogSource.matchAll(/\{\s*locale:\s*"([^"]+)"/gu)].map(
  (match) => match[1],
);
if (locales.length !== 101 || new Set(locales.map((locale) => locale.toLowerCase())).size !== 101) {
  throw new Error("The shared locale catalog must contain exactly 101 unique locales.");
}

const localeDirectory = path.join(repositoryRoot, "apps", "desktop", "src", "i18n", "locales");
const listingDirectory = path.join(repositoryRoot, "store", "listings");
await fs.mkdir(listingDirectory, { recursive: true });

function requireText(dictionary, key, locale) {
  const value = dictionary[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${locale}: missing non-empty translation for ${key}`);
  }
  if (/\{[^}]+\}/u.test(value)) {
    throw new Error(`${locale}: ${key} contains an unsupported template token`);
  }
  return value.trim();
}

function buildShortDescription(dictionary, locale) {
  let value = `${requireText(dictionary, "dashboard.title", locale)} ${requireText(dictionary, "session.platformSubtitle", locale)}`;
  if (value.length > 200) {
    value = `${requireText(dictionary, "dashboard.title", locale)} — ${requireText(dictionary, "dashboard.subtitle", locale)}`;
  }
  return value.length > 200 ? `${value.slice(0, 197).trimEnd()}…` : value;
}

const preservedLocales = new Set(["en-US", "zh-CN"]);
let generated = 0;
for (const locale of locales) {
  if (preservedLocales.has(locale)) {
    continue;
  }
  const dictionary = JSON.parse(
    await fs.readFile(path.join(localeDirectory, `${locale}.json`), "utf8"),
  );
  const listing = {
    locale,
    productName: "LumaTrace Performance Lab",
    editorialStatus: "direct_runtime_localization",
    shortDescription: buildShortDescription(dictionary, locale),
    description: [
      requireText(dictionary, "dashboard.title", locale),
      requireText(dictionary, "session.platformSubtitle", locale),
      `${requireText(dictionary, "session.platformWindowsTitle", locale)}: ${requireText(dictionary, "session.platformWindowsBody", locale)}`,
      `${requireText(dictionary, "session.platformAndroidTitle", locale)}: ${requireText(dictionary, "session.platformAndroidBody", locale)}`,
      requireText(dictionary, "report.subtitle", locale),
      requireText(dictionary, "session.exportLogsToReportDirHelp", locale),
      requireText(dictionary, "report.coreMetricsHelp", locale),
      requireText(dictionary, "dashboard.metaPrivate", locale),
    ].join("\n\n"),
    features: [
      "dashboard.metaLocal",
      "dashboard.metaPrivate",
      "dashboard.metaReport",
      "report.trendsTitle",
      "report.exports",
    ].map((key) => requireText(dictionary, key, locale)),
    keywords: [
      "common.metrics",
      "report.avgFps",
      "report.avgCpu",
      "report.avgMemory",
      "session.platformAndroidTitle",
      "session.platformWindowsTitle",
      "common.reports",
    ].map((key) => requireText(dictionary, key, locale)),
    screenshotCaptions: [
      "dashboard.title",
      "session.targetTitle",
      "session.runningTitle",
      "report.title",
    ].map((key) => requireText(dictionary, key, locale)),
    screenshotSourceLocale: "en-US",
    releaseNotes: "",
    privacyPolicyUrlCandidate:
      "https://github.com/a16036868481/LumaTrace/blob/main/store/privacy-policy.md",
    supportUrl: "https://github.com/a16036868481/LumaTrace/issues",
    licenseTermsUrl: "https://github.com/a16036868481/LumaTrace/blob/main/LICENSE",
  };
  await fs.writeFile(
    path.join(listingDirectory, `${locale}.json`),
    `${JSON.stringify(listing, null, 2)}\n`,
    "utf8",
  );
  generated += 1;
}

console.log(JSON.stringify({ localeCount: locales.length, generated, preserved: [...preservedLocales] }));
