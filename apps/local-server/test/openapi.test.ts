import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("OpenAPI documentation", () => {
  it("covers key MVP-A endpoints and schemas", () => {
    const openApi = readFileSync(resolve(process.cwd(), "../../docs/openapi.yaml"), "utf8");

    expect(openApi).toContain("/api/devices");
    expect(openApi).toContain("/api/sessions");
    expect(openApi).toContain("/api/sessions/{id}/report");
    expect(openApi).toContain("MetricEvent:");
  });
});
