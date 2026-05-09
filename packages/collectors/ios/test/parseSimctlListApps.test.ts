import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseSimctlListApps } from "../src/parsers/parseSimctlListApps";

function fixture(name: string): string {
  return readFileSync(resolve(process.cwd(), "../../../tests/fixtures/ios", name), "utf8");
}

describe("parseSimctlListApps", () => {
  it("parses user simulator apps and skips system apps", () => {
    const result = parseSimctlListApps(fixture("simctl_listapps_sample.json"));
    expect(result.apps).toHaveLength(2);
    expect(result.apps[0]).toMatchObject({
      bundleId: "com.example.game",
      name: "ExampleGame",
      displayName: "Example Game",
      applicationType: "User"
    });
    expect(JSON.stringify(result.apps)).not.toContain("/Users/alice");
  });

  it("warns on malformed entries", () => {
    const result = parseSimctlListApps(fixture("simctl_listapps_malformed.json"));
    expect(result.apps).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("warns when only system apps are present", () => {
    const result = parseSimctlListApps(fixture("simctl_listapps_empty.json"));
    expect(result.apps).toHaveLength(0);
    expect(result.warnings).toContain("No user simulator apps were parsed from simctl output.");
  });

  it("does not throw on invalid JSON", () => {
    const result = parseSimctlListApps("{not-json");
    expect(result.apps).toEqual([]);
    expect(result.warnings).toContain("simctl listapps output was not valid JSON.");
  });
});
