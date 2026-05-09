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

export function DeviceCard({ device, href }: DeviceCardProps) {
  const { t } = useI18n();
  const mockDevice = isMockDevice(device);
  const localPcDevice = isLocalPcDevice(device);
  const displayName = mockDevice
    ? t("device.mockDisplayName")
    : localPcDevice
      ? t("device.localPcDisplayName")
      : device.name;
  const description = mockDevice
    ? t("device.mockDescription")
    : localPcDevice
      ? t("device.localPcDescription")
      : `${device.platform} · ${device.connectionType}`;

  return (
    <article className="device-card">
      <div>
        <div className="device-card__title-row">
          <h3>{displayName}</h3>
          {mockDevice ? <span className="status-pill">{t("guide.mockBadge")}</span> : null}
          {localPcDevice ? (
            <span className="status-pill availability-badge--available">{t("guide.realBadge")}</span>
          ) : null}
        </div>
        <p>{description}</p>
        {displayName !== device.name ? <p className="muted-text">{device.name}</p> : null}
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
