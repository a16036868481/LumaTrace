export function splitPathEnv(pathValue: string | undefined): string[] {
  return (pathValue ?? "")
    .split(";")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export function buildWindowsExecutableCandidates(name: string, pathEntries: readonly string[]): string[] {
  const executableName = name.toLowerCase().endsWith(".exe") ? name : `${name}.exe`;
  return pathEntries.map((entry) => `${entry.replace(/[\\/]$/, "")}\\${executableName}`);
}
