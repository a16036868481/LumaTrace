import type { SidecarStatus } from "../tauri/sidecarStatus";
import { useI18n } from "../i18n/I18nProvider";

interface SidecarStatusBadgeProps {
  status: SidecarStatus | null;
}

export function SidecarStatusBadge({ status }: SidecarStatusBadgeProps) {
  const { t } = useI18n();
  const label = status?.status ?? "dev";
  const displayLabel =
    label === "running" ? t("common.ready") : label === "dev" ? t("common.dev") : label;
  return (
    <span className="status-pill" aria-label={t("common.sidecar")}>
      {t("common.sidecar")}: {displayLabel}
    </span>
  );
}
