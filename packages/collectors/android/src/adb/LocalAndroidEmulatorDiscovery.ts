import net from "node:net";

const DEFAULT_MUMU_BASE_PORT = 16384;
const DEFAULT_MUMU_INSTANCE_COUNT = 8;
const DEFAULT_MUMU_PORT_STEP = 32;

export const DEFAULT_LOCAL_ANDROID_EMULATOR_PORTS = [
  7555,
  ...Array.from(
    { length: DEFAULT_MUMU_INSTANCE_COUNT },
    (_value, index) => DEFAULT_MUMU_BASE_PORT + index * DEFAULT_MUMU_PORT_STEP
  )
] as const;

export interface LocalAndroidEmulatorDiscoveryOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  ports?: readonly number[];
  portProbeTimeoutMs?: number;
  isPortOpen?: (port: number, timeoutMs: number) => Promise<boolean>;
}

function uniquePorts(ports: readonly number[]): number[] {
  return [...new Set(ports.filter((port) => Number.isInteger(port) && port > 0 && port <= 65535))];
}

export function parseLocalAndroidEmulatorPorts(value: string | undefined): number[] {
  if (value === undefined || value.trim().length === 0) {
    return [...DEFAULT_LOCAL_ANDROID_EMULATOR_PORTS];
  }
  return uniquePorts(
    value
      .split(",")
      .map((part) => Number.parseInt(part.trim(), 10))
  );
}

export function isLocalhostAdbSerial(serial: string): boolean {
  return /^127\.0\.0\.1:\d+$/u.test(serial) || /^localhost:\d+$/u.test(serial);
}

export function formatLocalhostAdbSerial(port: number): string {
  return `127.0.0.1:${port}`;
}

export function parseLocalhostAdbPort(serial: string): number | undefined {
  const match = /^(?:127\.0\.0\.1|localhost):(\d+)$/u.exec(serial);
  if (match?.[1] === undefined) {
    return undefined;
  }
  const port = Number.parseInt(match[1], 10);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : undefined;
}

export function isKnownMumuAdbPort(port: number): boolean {
  return (
    port === 7555 ||
    (port >= DEFAULT_MUMU_BASE_PORT &&
      port < DEFAULT_MUMU_BASE_PORT + DEFAULT_MUMU_PORT_STEP * DEFAULT_MUMU_INSTANCE_COUNT)
  );
}

export async function isLocalPortOpen(port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    let settled = false;
    const finish = (open: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

export async function discoverReachableLocalAndroidEmulatorSerials(
  options: LocalAndroidEmulatorDiscoveryOptions = {}
): Promise<string[]> {
  const platform = options.platform ?? process.platform;
  if (platform !== "win32") {
    return [];
  }

  const env = options.env ?? process.env;
  if (env.LUMATRACE_ANDROID_AUTOCONNECT_EMULATORS === "0") {
    return [];
  }

  const ports = uniquePorts(options.ports ?? parseLocalAndroidEmulatorPorts(env.LUMATRACE_ANDROID_EMULATOR_PORTS));
  const timeoutMs = options.portProbeTimeoutMs ?? 150;
  const isPortOpen = options.isPortOpen ?? isLocalPortOpen;
  const serials: string[] = [];
  for (const port of ports) {
    if (await isPortOpen(port, timeoutMs)) {
      serials.push(formatLocalhostAdbSerial(port));
    }
  }
  return serials;
}
