import console from "node:console";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { URL, fileURLToPath } from "node:url";

const [sourceCsv, outputCsv, localeDirectory, previewDirectory] = process.argv.slice(2);

const catalogPath = fileURLToPath(
  new URL("../../apps/desktop/src/i18n/localeCatalog.ts", import.meta.url),
);
const catalogSource = await fs.readFile(catalogPath, "utf8");
const expectedStoreLocales = [...catalogSource.matchAll(/\{\s*locale:\s*"([^"]+)"/gu)].map(
  (match) => match[1],
);
const expectedStoreLocaleCodes = expectedStoreLocales.map((locale) => locale.toLowerCase());
if (
  expectedStoreLocaleCodes.length !== 101 ||
  new Set(expectedStoreLocaleCodes).size !== expectedStoreLocaleCodes.length
) {
  throw new Error(
    "The shared runtime and Microsoft Store locale catalog must contain 101 unique languages.",
  );
}

if (!sourceCsv || !outputCsv || !localeDirectory || !previewDirectory) {
  throw new Error(
    "Usage: node build-localized-listings.mjs <source.csv> <output.csv> <locale-dir> <preview-dir>",
  );
}

const csvText = await fs.readFile(sourceCsv, "utf8");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\r" || character === "\n") {
      if (character === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  if (quoted) {
    throw new Error("The Partner Center CSV contains an unterminated quoted field.");
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const values = parseCsv(csvText.replace(/^\uFEFF/, ""));

if (!Array.isArray(values) || values.length === 0) {
  throw new Error("The Partner Center CSV template is empty.");
}

const header = values[0].map((value) => String(value ?? "").trim());
const localeFiles = (await fs.readdir(localeDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
  .map((entry) => entry.name);
const localeFileByLowerCode = new Map(
  localeFiles.map((fileName) => [path.basename(fileName, ".json").toLowerCase(), fileName]),
);
const listingDirectory = fileURLToPath(new URL("../listings", import.meta.url));
const listingFiles = (await fs.readdir(listingDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
  .map((entry) => entry.name);
const listingFileByLowerCode = new Map(
  listingFiles.map((fileName) => [path.basename(fileName, ".json").toLowerCase(), fileName]),
);
const missingListingFiles = expectedStoreLocaleCodes.filter(
  (locale) => !listingFileByLowerCode.has(locale),
);
const unexpectedListingFiles = [...listingFileByLowerCode.keys()].filter(
  (locale) => !expectedStoreLocaleCodes.includes(locale),
);
if (
  listingFiles.length !== expectedStoreLocaleCodes.length ||
  listingFileByLowerCode.size !== listingFiles.length ||
  missingListingFiles.length > 0 ||
  unexpectedListingFiles.length > 0
) {
  throw new Error(
    `Store listing JSON files must exactly match the 101 runtime languages. Missing: ${missingListingFiles.join(", ") || "none"}. Unexpected: ${unexpectedListingFiles.join(", ") || "none"}.`,
  );
}

const fieldRow = new Map(
  values.slice(1).map((row, index) => [String(row[0] ?? ""), index + 1]),
);

function requireRow(...fields) {
  for (const field of fields) {
    const rowIndex = fieldRow.get(field);
    if (rowIndex !== undefined) {
      return rowIndex;
    }
  }
  throw new Error(`Missing Partner Center field: ${fields.join(" or ")}`);
}

function requireText(dictionary, key, localeCode) {
  const value = dictionary[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${localeCode}: missing non-empty translation for ${key}`);
  }
  if (/\{[^}]+\}/.test(value)) {
    throw new Error(`${localeCode}: ${key} contains an unsupported template token`);
  }
  return value.trim();
}

function setField(fields, columnIndex, value) {
  const aliases = Array.isArray(fields) ? fields : [fields];
  values[requireRow(...aliases)][columnIndex] = value;
}

const enUsColumn = header.indexOf("en-us");
if (enUsColumn < 0) {
  throw new Error("The exported template does not contain en-us.");
}

const screenshotFields = (index) => [
  `DesktopScreenshot${index}`,
  `Screenshots${index}`,
];
const screenshotCaptionFields = (index) => [
  `DesktopScreenshotCaption${index}`,
  `ScreenshotCaption${index}`,
];
const featureFields = (index) => [`Feature${index}`, `ProductFeatures${index}`];
const searchTermFields = (index) => [`SearchTerm${index}`, `SearchTerms${index}`];

const englishScreenshotUrls = [1, 2, 3, 4].map((index) => {
  const value = values[requireRow(...screenshotFields(index))][enUsColumn];
  if (typeof value !== "string" || !value.startsWith("https://")) {
    throw new Error(`The English listing is missing DesktopScreenshot${index}.`);
  }
  return value;
});

const listingColumns = [];
for (let columnIndex = 4; columnIndex < header.length; columnIndex += 1) {
  const storeLocaleCode = header[columnIndex].toLowerCase();
  const localeFileName = localeFileByLowerCode.get(storeLocaleCode);
  if (!localeFileName) {
    throw new Error(`No packaged UI dictionary matches Store locale ${storeLocaleCode}.`);
  }

  const dictionary = JSON.parse(
    await fs.readFile(path.join(localeDirectory, localeFileName), "utf8"),
  );
  const listingFileName = listingFileByLowerCode.get(storeLocaleCode);
  const listing = JSON.parse(
    await fs.readFile(path.join(listingDirectory, listingFileName), "utf8"),
  );
  if (String(listing.locale ?? "").toLowerCase() !== storeLocaleCode) {
    throw new Error(`${storeLocaleCode}: listing locale does not match its file name`);
  }
  listingColumns.push({ columnIndex, storeLocaleCode, localeFileName });

  if (storeLocaleCode === "en-us" || storeLocaleCode === "zh-cn") {
    continue;
  }

  const description = String(listing.description ?? "").trim();
  const shortDescription = String(listing.shortDescription ?? "").trim();
  const features = Array.isArray(listing.features) ? listing.features : [];
  const keywords = Array.isArray(listing.keywords) ? listing.keywords : [];
  if (!description || !shortDescription || features.length < 5 || keywords.length < 7) {
    throw new Error(`${storeLocaleCode}: localized Store listing is incomplete`);
  }

  setField("Description", columnIndex, description);
  setField("ShortDescription", columnIndex, shortDescription);
  setField(["DevStudio", "DevelopedBy"], columnIndex, "eirros");
  setField(
    ["CopyrightTrademarkInformation", "Copyright"],
    columnIndex,
    "Copyright © 2026 eirros. All rights reserved.",
  );

  for (let screenshotIndex = 1; screenshotIndex <= 4; screenshotIndex += 1) {
    setField(
      screenshotFields(screenshotIndex),
      columnIndex,
      englishScreenshotUrls[screenshotIndex - 1],
    );
  }

  const screenshotCaptions = [
    "dashboard.title",
    "session.targetTitle",
    "session.runningTitle",
    "report.title",
  ];
  screenshotCaptions.forEach((key, index) => {
    setField(
      screenshotCaptionFields(index + 1),
      columnIndex,
      requireText(dictionary, key, storeLocaleCode),
    );
  });

  features.slice(0, 5).forEach((feature, index) => {
    setField(
      featureFields(index + 1),
      columnIndex,
      String(feature).trim(),
    );
  });

  keywords.slice(0, 7).forEach((keyword, index) => {
    setField(
      searchTermFields(index + 1),
      columnIndex,
      String(keyword).trim(),
    );
  });
}

const actualStoreLocaleCodes = listingColumns.map(({ storeLocaleCode }) => storeLocaleCode);
const actualStoreLocaleSet = new Set(actualStoreLocaleCodes);
const missingStoreLocales = expectedStoreLocaleCodes.filter(
  (locale) => !actualStoreLocaleSet.has(locale),
);
const unexpectedStoreLocales = actualStoreLocaleCodes.filter(
  (locale) => !expectedStoreLocaleCodes.includes(locale),
);
if (
  actualStoreLocaleCodes.length !== expectedStoreLocaleCodes.length ||
  actualStoreLocaleSet.size !== actualStoreLocaleCodes.length ||
  missingStoreLocales.length > 0 ||
  unexpectedStoreLocales.length > 0
) {
  throw new Error(
    `Partner Center languages must exactly match the 101 runtime languages. Missing: ${missingStoreLocales.join(", ") || "none"}. Unexpected: ${unexpectedStoreLocales.join(", ") || "none"}.`,
  );
}

const descriptionRow = requireRow("Description");
const shortDescriptionRow = requireRow("ShortDescription");
const qa = {
  sourceCsv,
  outputCsv,
  expectedLanguageCount: expectedStoreLocaleCodes.length,
  languageCount: listingColumns.length,
  languages: listingColumns.map(({ storeLocaleCode, localeFileName, columnIndex }) => ({
    storeLocaleCode,
    localeFileName,
    descriptionLength: String(values[descriptionRow][columnIndex] ?? "").length,
    shortDescriptionLength: String(values[shortDescriptionRow][columnIndex] ?? "").length,
    screenshotCount: [1, 2, 3, 4].filter(
      (index) =>
        String(values[requireRow(...screenshotFields(index))][columnIndex] ?? "") !== "",
    ).length,
    featureLengths: [1, 2, 3, 4, 5].map(
      (index) =>
        String(values[requireRow(...featureFields(index))][columnIndex] ?? "").length,
    ),
    searchTerms: [1, 2, 3, 4, 5, 6, 7].map((index) =>
      String(values[requireRow(...searchTermFields(index))][columnIndex] ?? "").trim(),
    ),
  })),
};

const invalidLanguages = qa.languages.filter(
  (entry) =>
    entry.descriptionLength === 0 ||
    entry.descriptionLength > 10_000 ||
    entry.shortDescriptionLength === 0 ||
    entry.shortDescriptionLength > 1_000 ||
    entry.screenshotCount < 1 ||
    entry.featureLengths.some((length) => length > 200) ||
    entry.searchTerms.some((term) => term.length > 40) ||
    new Set(
      entry.searchTerms
        .filter(Boolean)
        .flatMap((term) => term.split(/\s+/u))
        .map((word) => word.toLowerCase()),
    ).size > 21,
);
if (invalidLanguages.length > 0) {
  throw new Error(`Listing validation failed: ${JSON.stringify(invalidLanguages)}`);
}

await fs.mkdir(path.dirname(outputCsv), { recursive: true });
await fs.mkdir(previewDirectory, { recursive: true });

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

const outputText = `\uFEFF${values.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
await fs.writeFile(outputCsv, outputText, "utf8");
await fs.writeFile(
  path.join(previewDirectory, "listing-qa.json"),
  `${JSON.stringify(qa, null, 2)}\n`,
  "utf8",
);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildPreview(columnIndexes) {
  const previewRows = values.slice(0, 18);
  const body = previewRows
    .map(
      (row, rowIndex) =>
        `<tr>${columnIndexes
          .map((columnIndex) => {
            const tag = rowIndex === 0 ? "th" : "td";
            return `<${tag}>${escapeHtml(row[columnIndex])}</${tag}>`;
          })
          .join("")}</tr>`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>LumaTrace listing preview</title>
<style>body{font:14px system-ui;margin:24px}table{border-collapse:collapse}th,td{border:1px solid #ccd6dd;padding:6px;max-width:360px;vertical-align:top;white-space:pre-wrap}th{background:#eef4f6}</style>
</head><body><table>${body}</table></body></html>\n`;
}

const firstColumns = Array.from({ length: Math.min(10, header.length) }, (_, index) => index);
const lastColumns = [0, 1, 2, ...Array.from({ length: Math.min(8, header.length) }, (_, index) => header.length - Math.min(8, header.length) + index)]
  .filter((value, index, array) => value >= 0 && array.indexOf(value) === index);
await fs.writeFile(
  path.join(previewDirectory, "listing-preview-first.html"),
  buildPreview(firstColumns),
  "utf8",
);
await fs.writeFile(
  path.join(previewDirectory, "listing-preview-last.html"),
  buildPreview(lastColumns),
  "utf8",
);

const formulaErrors = values.flatMap((row, rowIndex) =>
  row.flatMap((value, columnIndex) =>
    /#REF!|#DIV\/0!|#VALUE!|#NAME\?|#N\/A/u.test(String(value ?? ""))
      ? [{ row: rowIndex + 1, column: columnIndex + 1, value }]
      : [],
  ),
);
if (formulaErrors.length > 0) {
  throw new Error(`Partner Center CSV contains formula errors: ${JSON.stringify(formulaErrors)}`);
}

console.log(JSON.stringify({ outputCsv, ...qa }, null, 2));
