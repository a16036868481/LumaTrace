import { readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const localeDirectory = resolve(scriptDirectory, "../src/i18n/locales");
const english = JSON.parse(readFileSync(resolve(localeDirectory, "en-US.json"), "utf8"));

const exactEnglishKeys = new Set(["support.githubIssues"]);
for (const file of readdirSync(localeDirectory).filter(
  (candidate) => candidate.endsWith(".json") && candidate !== "en-US.json"
)) {
  const path = resolve(localeDirectory, file);
  const dictionary = JSON.parse(readFileSync(path, "utf8"));
  for (const [key, source] of Object.entries(english)) {
    if (exactEnglishKeys.has(key)) {
      dictionary[key] = source;
      continue;
    }
  }
  const temporaryPath = `${path}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(dictionary, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, path);
}
