import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import { URL, fileURLToPath } from "node:url";

const localeDirectory = fileURLToPath(new URL("../src/i18n/locales/", import.meta.url));
const cyrillicPath = `${localeDirectory}sr-Cyrl-RS.json`;
const latinPath = `${localeDirectory}sr.json`;

const cyrillicToLatin = new Map([
  ["А", "A"],
  ["Б", "B"],
  ["В", "V"],
  ["Г", "G"],
  ["Д", "D"],
  ["Ђ", "Đ"],
  ["Е", "E"],
  ["Ж", "Ž"],
  ["З", "Z"],
  ["И", "I"],
  ["Ј", "J"],
  ["К", "K"],
  ["Л", "L"],
  ["Љ", "Lj"],
  ["М", "M"],
  ["Н", "N"],
  ["Њ", "Nj"],
  ["О", "O"],
  ["П", "P"],
  ["Р", "R"],
  ["С", "S"],
  ["Т", "T"],
  ["Ћ", "Ć"],
  ["У", "U"],
  ["Ф", "F"],
  ["Х", "H"],
  ["Ц", "C"],
  ["Ч", "Č"],
  ["Џ", "Dž"],
  ["Ш", "Š"],
  ["а", "a"],
  ["б", "b"],
  ["в", "v"],
  ["г", "g"],
  ["д", "d"],
  ["ђ", "đ"],
  ["е", "e"],
  ["ж", "ž"],
  ["з", "z"],
  ["и", "i"],
  ["ј", "j"],
  ["к", "k"],
  ["л", "l"],
  ["љ", "lj"],
  ["м", "m"],
  ["н", "n"],
  ["њ", "nj"],
  ["о", "o"],
  ["п", "p"],
  ["р", "r"],
  ["с", "s"],
  ["т", "t"],
  ["ћ", "ć"],
  ["у", "u"],
  ["ф", "f"],
  ["х", "h"],
  ["ц", "c"],
  ["ч", "č"],
  ["џ", "dž"],
  ["ш", "š"]
]);

function transliterate(value) {
  return [...value].map((character) => cyrillicToLatin.get(character) ?? character).join("");
}

const source = JSON.parse(await readFile(cyrillicPath, "utf8"));
const entries = Object.entries(source);

if (entries.length !== 577) {
  throw new Error(`Expected 577 Serbian translation keys, received ${entries.length}.`);
}

const latinDictionary = Object.fromEntries(
  entries.map(([key, value]) => [key, transliterate(value)])
);

const remainingCyrillic = Object.entries(latinDictionary).filter(([, value]) =>
  /[А-Ша-шЂђЈјЉљЊњЋћЏџ]/u.test(value)
);
if (remainingCyrillic.length > 0) {
  throw new Error(`Cyrillic text remained in ${remainingCyrillic.length} Latin Serbian values.`);
}

await writeFile(latinPath, `${JSON.stringify(latinDictionary, null, 2)}\n`, "utf8");

process.stdout.write(`Derived ${entries.length} Serbian Latin and Cyrillic translation values.\n`);
