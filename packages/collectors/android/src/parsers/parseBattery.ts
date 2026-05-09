export interface AndroidBatteryInfo {
  level?: number;
  scale?: number;
  levelPercent?: number;
  status?: number;
  health?: number;
  present?: boolean;
  plugged?: boolean;
  acPowered?: boolean;
  usbPowered?: boolean;
  wirelessPowered?: boolean;
  voltageMv?: number;
  temperatureC?: number;
  rawTemperature?: number;
  chargeCounterUah?: number;
  maxChargingCurrentUa?: number;
  maxChargingCurrentMa?: number;
  maxChargingVoltageUv?: number;
  currentNowUa?: number;
  currentNowMa?: number;
  warnings: string[];
}

function parseBoolean(value: string): boolean | undefined {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return undefined;
}

function setNumber(info: AndroidBatteryInfo, key: keyof AndroidBatteryInfo, value: string): void {
  const parsed = Number.parseInt(value, 10);
  if (Number.isFinite(parsed)) {
    Object.assign(info, { [key]: parsed });
  }
}

export function parseBattery(output: string): AndroidBatteryInfo {
  const info: AndroidBatteryInfo = { warnings: [] };

  for (const line of output.split(/\r?\n/u)) {
    const match = /^\s*([^:]+):\s*(.+?)\s*$/u.exec(line);
    if (match?.[1] === undefined || match[2] === undefined) {
      continue;
    }
    const key = match[1].trim().toLowerCase();
    const value = match[2].trim();

    switch (key) {
      case "ac powered":
        {
          const parsed = parseBoolean(value);
          if (parsed !== undefined) {
            info.acPowered = parsed;
          }
        }
        break;
      case "usb powered":
        {
          const parsed = parseBoolean(value);
          if (parsed !== undefined) {
            info.usbPowered = parsed;
          }
        }
        break;
      case "wireless powered":
        {
          const parsed = parseBoolean(value);
          if (parsed !== undefined) {
            info.wirelessPowered = parsed;
          }
        }
        break;
      case "present":
        {
          const parsed = parseBoolean(value);
          if (parsed !== undefined) {
            info.present = parsed;
          }
        }
        break;
      case "status":
        setNumber(info, "status", value);
        break;
      case "health":
        setNumber(info, "health", value);
        break;
      case "level":
        setNumber(info, "level", value);
        break;
      case "scale":
        setNumber(info, "scale", value);
        break;
      case "voltage":
        setNumber(info, "voltageMv", value);
        break;
      case "temperature":
        setNumber(info, "rawTemperature", value);
        break;
      case "charge counter":
        setNumber(info, "chargeCounterUah", value);
        break;
      case "max charging current":
        setNumber(info, "maxChargingCurrentUa", value);
        break;
      case "max charging voltage":
        setNumber(info, "maxChargingVoltageUv", value);
        break;
      case "current now":
        setNumber(info, "currentNowUa", value);
        break;
      default:
        break;
    }
  }

  if (info.level !== undefined && info.scale !== undefined) {
    if (info.scale > 0) {
      info.levelPercent = (info.level / info.scale) * 100;
    } else {
      info.warnings.push("Battery scale is zero; levelPercent was not calculated.");
    }
  }
  if (info.rawTemperature !== undefined) {
    info.temperatureC = info.rawTemperature / 10;
  }
  if (info.maxChargingCurrentUa !== undefined) {
    info.maxChargingCurrentMa = info.maxChargingCurrentUa / 1000;
  }
  if (info.currentNowUa !== undefined) {
    info.currentNowMa = info.currentNowUa / 1000;
  }
  info.plugged = info.acPowered === true || info.usbPowered === true || info.wirelessPowered === true;

  return info;
}
