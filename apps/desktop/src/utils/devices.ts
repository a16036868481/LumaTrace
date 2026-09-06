import type { Device } from "../api/types";

export function isMockDevice(device: Device): boolean {
  return device.tags?.source === "mock" || device.name.toLowerCase().includes("mock");
}

export function visibleUserDevices(devices: Device[] | null | undefined): Device[] {
  return (devices ?? []).filter(
    (device) => !isMockDevice(device) && (device.platform === "windows" || device.platform === "android")
  );
}
