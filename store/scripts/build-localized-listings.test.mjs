import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { URL, fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const scriptPath = path.join(repositoryRoot, "store", "scripts", "build-localized-listings.mjs");
const localeDirectory = path.join(repositoryRoot, "apps", "desktop", "src", "i18n", "locales");
const listingDirectory = path.join(repositoryRoot, "store", "listings");
const catalogSource = await fs.readFile(
  path.join(repositoryRoot, "apps", "desktop", "src", "i18n", "localeCatalog.ts"),
  "utf8",
);
const localeCodes = [...catalogSource.matchAll(/\{\s*locale:\s*"([^"]+)"/gu)].map((match) =>
  match[1].toLowerCase(),
);
const temporaryRoot = "D:\\LumaTraceTemp\\store-listing-tests";

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function buildTemplate(codes) {
  const rows = [["Field", "ID", "Type", "default", ...codes]];
  const fields = [
    "Description",
    "ShortDescription",
    "DevelopedBy",
    "Copyright",
    ...Array.from({ length: 4 }, (_, index) => `DesktopScreenshot${index + 1}`),
    ...Array.from({ length: 4 }, (_, index) => `DesktopScreenshotCaption${index + 1}`),
    ...Array.from({ length: 5 }, (_, index) => `Feature${index + 1}`),
    ...Array.from({ length: 7 }, (_, index) => `SearchTerm${index + 1}`),
  ];

  for (const field of fields) {
    const row = [field, "String", "", "", ...codes.map(() => "")];
    codes.forEach((code, index) => {
      if (code === "en-us" || code === "zh-cn") {
        if (field === "Description") row[index + 4] = `${code} full description`;
        if (field === "ShortDescription") row[index + 4] = `${code} short description`;
        if (field.startsWith("DesktopScreenshot")) {
          row[index + 4] = field.includes("Caption")
            ? `${code} screenshot caption`
            : `https://example.com/${field}.png`;
        }
      }
    });
    rows.push(row);
  }

  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

async function runGenerator(codes, testName) {
  await fs.mkdir(temporaryRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(temporaryRoot, `${testName}-`));
  const sourceCsv = path.join(directory, "source.csv");
  const outputCsv = path.join(directory, "output.csv");
  const previewDirectory = path.join(directory, "preview");
  await fs.writeFile(sourceCsv, buildTemplate(codes), "utf8");
  const result = spawnSync(
    process.execPath,
    [scriptPath, sourceCsv, outputCsv, localeDirectory, previewDirectory],
    { cwd: repositoryRoot, encoding: "utf8", timeout: 60_000 },
  );
  return { directory, outputCsv, previewDirectory, result };
}

test("builds exactly 101 localized Partner Center listing columns", async () => {
  assert.equal(localeCodes.length, 101);
  assert.equal(new Set(localeCodes).size, 101);
  const { outputCsv, previewDirectory, result } = await runGenerator(localeCodes, "complete");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const qa = JSON.parse(
    await fs.readFile(path.join(previewDirectory, "listing-qa.json"), "utf8"),
  );
  assert.equal(qa.expectedLanguageCount, 101);
  assert.equal(qa.languageCount, 101);
  assert.deepEqual(
    qa.languages.map(({ storeLocaleCode }) => storeLocaleCode),
    localeCodes,
  );
  const output = await fs.readFile(outputCsv, "utf8");
  assert.match(output, /chr-cher-us/u);
  assert.match(output, /quc-latn/u);
  await fs.access(path.join(previewDirectory, "listing-preview-first.html"));
  await fs.access(path.join(previewDirectory, "listing-preview-last.html"));
});

test("keeps one complete Store listing JSON for every runtime locale", async () => {
  const listingFiles = (await fs.readdir(listingDirectory))
    .filter((fileName) => fileName.endsWith(".json"))
    .sort((left, right) => left.localeCompare(right));
  assert.equal(listingFiles.length, 101);
  assert.deepEqual(
    listingFiles.map((fileName) => path.basename(fileName, ".json").toLowerCase()).sort(),
    localeCodes.toSorted(),
  );
  for (const locale of localeCodes) {
    const fileName = listingFiles.find(
      (candidate) => path.basename(candidate, ".json").toLowerCase() === locale,
    );
    const listing = JSON.parse(await fs.readFile(path.join(listingDirectory, fileName), "utf8"));
    assert.equal(listing.locale.toLowerCase(), locale);
    assert.ok(listing.description.trim().length > 0 && listing.description.length <= 10_000);
    assert.ok(
      listing.shortDescription.trim().length > 0 && listing.shortDescription.length <= 1_000,
    );
    assert.ok(listing.features.length >= 5);
    assert.ok(listing.features.every((feature) => feature.trim() && feature.length <= 200));
    assert.equal(listing.keywords.length, 7);
    assert.ok(listing.keywords.every((keyword) => keyword.trim() && keyword.length <= 40));
  }
});

test("rejects a Partner Center template with a missing runtime locale", async () => {
  const { result } = await runGenerator(localeCodes.slice(0, -1), "missing");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must exactly match the 101 runtime languages/u);
});

test("rejects duplicate or substituted Partner Center locale columns", async () => {
  const duplicateCodes = [...localeCodes.slice(0, -1), localeCodes[0]];
  const { result } = await runGenerator(duplicateCodes, "duplicate");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must exactly match the 101 runtime languages/u);
});
