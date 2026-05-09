export const ADB_COMMANDS = {
  VERSION: ["version"],
  DEVICES_LONG: ["devices", "-l"],
  GETPROP: ["shell", "getprop"],
  LIST_PACKAGES: ["shell", "pm", "list", "packages"],
  PIDOF: ["shell", "pidof"],
  PS_A: ["shell", "ps", "-A"],
  PS: ["shell", "ps"],
  DUMPSYS_PACKAGE: ["shell", "dumpsys", "package"]
} as const;

export function serialArgs(serial: string, args: readonly string[]): string[] {
  return ["-s", serial, ...args];
}
