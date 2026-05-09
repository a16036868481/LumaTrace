import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function readAndroidFixture(name: string): string {
  return readFileSync(resolve(process.cwd(), "../../../tests/fixtures/android", name), "utf8");
}
