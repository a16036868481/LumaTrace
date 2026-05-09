import type { AndroidDeviceInfo } from "../types";

const GETPROP_LINE_PATTERN = /^\[([^\]]+)\]:\s+\[(.*)\]$/u;

export function parseGetProp(output: string): Record<string, string> {
  const props: Record<string, string> = {};
  for (const line of output.split(/\r?\n/u)) {
    const match = GETPROP_LINE_PATTERN.exec(line.trim());
    if (match?.[1] !== undefined && match[2] !== undefined) {
      props[match[1]] = match[2];
    }
  }
  return props;
}

function readProp(props: Record<string, string>, key: string): string | undefined {
  const value = props[key];
  return value === undefined || value.length === 0 ? undefined : value;
}

export function getAndroidDeviceInfoFromProps(
  props: Record<string, string>,
  fallbackSerial = "android-device"
): AndroidDeviceInfo {
  const model = readProp(props, "ro.product.model");
  const productDevice = readProp(props, "ro.product.device");
  const release = readProp(props, "ro.build.version.release");
  const sdk = readProp(props, "ro.build.version.sdk");
  const manufacturer = readProp(props, "ro.product.manufacturer");
  const brand = readProp(props, "ro.product.brand");
  const abi = readProp(props, "ro.product.cpu.abi");
  const buildFingerprint = readProp(props, "ro.build.fingerprint");
  const tags: Record<string, string | number | boolean> = {};

  if (manufacturer !== undefined) {
    tags.manufacturer = manufacturer;
  }
  if (brand !== undefined) {
    tags.brand = brand;
  }
  if (abi !== undefined) {
    tags.abi = abi;
  }
  if (buildFingerprint !== undefined) {
    tags.buildFingerprint = buildFingerprint;
  }
  if (sdk !== undefined) {
    tags.sdk = sdk;
  }

  const info: AndroidDeviceInfo = {
    name: model ?? productDevice ?? fallbackSerial,
    tags
  };
  if (release !== undefined || sdk !== undefined) {
    info.osVersion = `Android ${release ?? "unknown"}${sdk === undefined ? "" : ` (SDK ${sdk})`}`;
  }
  if (manufacturer !== undefined) {
    info.manufacturer = manufacturer;
  }
  if (brand !== undefined) {
    info.brand = brand;
  }
  if (abi !== undefined) {
    info.abi = abi;
  }
  if (buildFingerprint !== undefined) {
    info.buildFingerprint = buildFingerprint;
  }
  if (sdk !== undefined) {
    info.sdk = sdk;
  }
  return info;
}
