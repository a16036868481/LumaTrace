import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const i18nDirectory = resolve(scriptDirectory, "../src/i18n");
const localeDirectory = resolve(i18nDirectory, "locales");
const catalogSource = readFileSync(resolve(i18nDirectory, "localeCatalog.ts"), "utf8");
const catalogLocales = [...catalogSource.matchAll(/\{\s*locale: "([^"]+)"/g)].map(
  (match) => match[1]
);

if (catalogLocales.length !== 101 || new Set(catalogLocales).size !== catalogLocales.length) {
  throw new Error(
    "The Microsoft Store-aligned locale catalog must contain 101 unique identifiers."
  );
}
for (const locale of catalogLocales) {
  try {
    const [canonicalLocale] = Intl.getCanonicalLocales(locale);
    const microsoftStoreAliases = new Map([
      ["prs-AF", "fa-AF"],
      ["quz-PE", "qu-PE"]
    ]);
    if (canonicalLocale !== locale && microsoftStoreAliases.get(locale) !== canonicalLocale) {
      throw new Error(`canonical form is ${canonicalLocale}`);
    }
  } catch (error) {
    throw new Error(
      `${locale} is not a canonical BCP 47 locale identifier: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

const localeFiles = readdirSync(localeDirectory)
  .filter((file) => file.endsWith(".json"))
  .map((file) => file.slice(0, -5))
  .sort();
if (!localeFiles.includes("en-US")) {
  throw new Error("The packaged translations must include en-US.");
}
const unexpected = localeFiles.filter((locale) => !catalogLocales.includes(locale));
if (unexpected.length > 0) {
  throw new Error(
    `Translation files are missing from the global locale catalog: ${unexpected.join(", ")}.`
  );
}

const english = JSON.parse(readFileSync(resolve(localeDirectory, "en-US.json"), "utf8"));
const expectedKeys = Object.keys(english).sort();
const exactEnglishKeys = new Set(["support.githubIssues"]);
const templateTokens = (value) =>
  [...value.matchAll(/\{[a-zA-Z0-9_]+\}/g)].map((match) => match[0]).sort();

for (const locale of localeFiles) {
  const dictionary = JSON.parse(readFileSync(resolve(localeDirectory, `${locale}.json`), "utf8"));
  let localizedValueCount = 0;
  const receivedKeys = Object.keys(dictionary).sort();
  if (JSON.stringify(receivedKeys) !== JSON.stringify(expectedKeys)) {
    throw new Error(`${locale} does not contain the exact English key set.`);
  }
  for (const key of expectedKeys) {
    const value = dictionary[key];
    if (value !== english[key]) {
      localizedValueCount += 1;
    }
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`${locale}:${key} is empty or is not a string.`);
    }
    if (/\p{L}|\p{N}/u.test(english[key]) && !/\p{L}|\p{N}/u.test(value)) {
      throw new Error(`${locale}:${key} lost all letters and numbers.`);
    }
    if (value.includes("\uFFFD") || value.includes("91827364")) {
      throw new Error(`${locale}:${key} contains a damaged character or translation sentinel.`);
    }
    if (typeof value.isWellFormed === "function" && !value.isWellFormed()) {
      throw new Error(`${locale}:${key} contains an unpaired Unicode surrogate.`);
    }
    if (exactEnglishKeys.has(key) && value !== english[key]) {
      throw new Error(`${locale}:${key} changed a non-localizable address.`);
    }
    if (JSON.stringify(templateTokens(value)) !== JSON.stringify(templateTokens(english[key]))) {
      throw new Error(`${locale}:${key} changed a runtime template placeholder.`);
    }
  }
  if (locale !== "en-US" && localizedValueCount < Math.ceil(expectedKeys.length * 0.45)) {
    throw new Error(
      `${locale} localized only ${localizedValueCount}/${expectedKeys.length} values.`
    );
  }
}
