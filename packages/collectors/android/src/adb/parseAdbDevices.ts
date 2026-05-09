import type { AndroidAdbDevice, AdbDeviceState } from "../types";

function parseState(value: string | undefined): AdbDeviceState {
  if (value === "device" || value === "offline" || value === "unauthorized") {
    return value;
  }
  return "unknown";
}

function parseField(parts: readonly string[], key: string): string | undefined {
  const prefix = `${key}:`;
  return parts.find((part) => part.startsWith(prefix))?.slice(prefix.length);
}

export function parseAdbDevices(output: string): AndroidAdbDevice[] {
  const devices: AndroidAdbDevice[] = [];
  for (const line of output.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || /^List of devices attached$/iu.test(trimmed)) {
      continue;
    }

    const parts = trimmed.split(/\s+/u);
    const serial = parts[0];
    if (serial === undefined || serial.length === 0) {
      continue;
    }

    const record: AndroidAdbDevice = {
      serial,
      state: parseState(parts[1]),
      rawLine: line
    };
    const product = parseField(parts, "product");
    const model = parseField(parts, "model");
    const device = parseField(parts, "device");
    const transportId = parseField(parts, "transport_id");
    if (product !== undefined) {
      record.product = product;
    }
    if (model !== undefined) {
      record.model = model;
    }
    if (device !== undefined) {
      record.device = device;
    }
    if (transportId !== undefined) {
      record.transportId = transportId;
    }
    devices.push(record);
  }

  return devices;
}
