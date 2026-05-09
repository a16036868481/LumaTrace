function stringifyCsvValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }

  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value) ?? "";
}

export function csvEscape(value: unknown): string {
  const stringValue = stringifyCsvValue(value);
  if (/[",\r\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, "\"\"")}"`;
  }

  return stringValue;
}

export function csvRow(values: readonly unknown[]): string {
  return values.map((value) => csvEscape(value)).join(",");
}

export function csvTable(headers: readonly string[], rows: readonly (readonly unknown[])[]): string {
  return [csvRow(headers), ...rows.map((row) => csvRow(row))].join("\n") + "\n";
}
