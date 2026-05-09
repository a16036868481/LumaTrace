import { describe, expect, it } from "vitest";
import { csvEscape } from "../src/utils/csvEscape";
import { htmlEscape } from "../src/utils/htmlEscape";
import { sanitizeFileBaseName } from "../src/utils/fileWriter";

describe("csv escaping", () => {
  it("escapes commas, quotes, newlines, JSON tags, and empty values", () => {
    expect(csvEscape("a,b")).toBe("\"a,b\"");
    expect(csvEscape("a \"quote\"")).toBe("\"a \"\"quote\"\"\"");
    expect(csvEscape("line 1\nline 2")).toBe("\"line 1\nline 2\"");
    expect(csvEscape({ tag: "a,b" })).toBe("\"{\"\"tag\"\":\"\"a,b\"\"}\"");
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
  });
});

describe("html escaping", () => {
  it("escapes script-like input and HTML special characters", () => {
    expect(htmlEscape("<script>alert('x')</script>")).toBe(
      "&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;"
    );
    expect(htmlEscape("&<>\"'")).toBe("&amp;&lt;&gt;&quot;&#39;");
    expect(htmlEscape({ label: "<b>" })).toBe("{&quot;label&quot;:&quot;&lt;b&gt;&quot;}");
    expect(htmlEscape(Number.NaN)).toBe("N/A");
  });
});

describe("file name sanitizing", () => {
  it("prevents path traversal characters", () => {
    expect(sanitizeFileBaseName("../evil/report")).toBe("_evil_report");
    expect(sanitizeFileBaseName("session 1:final")).toBe("session_1_final");
    expect(sanitizeFileBaseName("...")).toBe("report");
  });
});
