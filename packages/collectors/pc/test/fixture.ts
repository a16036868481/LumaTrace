import { readFileSync } from "node:fs";
import { join } from "node:path";

export function readPcFixture(name: string): string {
  return readFileSync(join(process.cwd(), "../../../tests/fixtures/pc", name), "utf8");
}
