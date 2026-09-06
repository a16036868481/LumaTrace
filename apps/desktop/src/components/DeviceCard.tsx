import type { Device } from "../api/types";
import { useI18n } from "../i18n/I18nProvider";
import { isMockDevice } from "../utils/devices";

export interface DeviceCardProps {
  device: Device;
  href?: string;
}

function isLocalPcDevice(device: Device): boolean {
  return device.name === "Local PC" || device.id.startsWith("pc-local");
}

function platformLabel(platform: Device["platform"]): string {
  if (platform === "android") {
    return "Android";
  }
  if (platform === "windows") {
    return "Windows";
  }
  return platform;
}

export function DeviceCard({ device, href }: DeviceCardProps) {
  const { t } = useI18n();
  const mockDevice = isMockDevice(device);
  const localPcDevice = isLocalPcDevice(device);
  let connectionLabel: string = device.connectionType;
  if (device.connectionType === "usb") {
    connectionLabel = t("device.connection.usb");
  } else if (device.connectionType === "local") {
    connectionLabel = t("device.connection.local");
  } else if (device.connectionType === "network") {
    connectionLabel = t("device.connection.network");
  } else if (device.connectionType === "simulator") {
    connectionLabel = t("device.connection.simulator");
  }
  const displayName = mockDevice
    ? t("device.mockDisplayName")
    : localPcDevice
      ? t("device.localPcDisplayName")
      : device.name;
  const description = mockDevice
    ? t("device.mockDescription")
    : localPcDevice
      ? t("device.localPcDescription")
      : `${platformLabel(device.platform)} · ${connectionLabel}`;

  return (
    <article className="device-card">
      <div>
        <div className="device-card__title-row">
          <h3>{displayName}</h3>
          {mockDevice ? <span className="status-pill">{t("guide.mockBadge")}</span> : null}
          {localPcDevice ? (
            <span className="status-pill availability-badge--available">
              {t("guide.realBadge")}
            </span>
          ) : null}
        </div>
        <p>{description}</p>
      </div>
      <dl>
        <div>
          <dt>{t("common.os")}</dt>
          <dd>{device.osVersion ?? t("common.na")}</dd>
        </div>
        <div>
          <dt>{t("common.capabilities")}</dt>
          <dd>{device.capabilities.length}</dd>
        </div>
      </dl>
      {href !== undefined ? (
        <a className="button button-secondary" href={href}>
          {t("common.viewTargets")}
        </a>
      ) : null}
    </article>
  );
}
