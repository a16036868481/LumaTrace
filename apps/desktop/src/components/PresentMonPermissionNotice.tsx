import { useI18n } from "../i18n/I18nProvider";

interface PresentMonPermissionNoticeProps {
  active?: boolean;
}

export function PresentMonPermissionNotice({ active = true }: PresentMonPermissionNoticeProps) {
  const { t } = useI18n();
  if (!active) {
    return null;
  }
  return (
    <div className="panel" role="note" aria-label={t("presentMon.permissionsTitle")}>
      <h2>{t("presentMon.permissionsTitle")}</h2>
      <p>{t("presentMon.permissionsBody")}</p>
    </div>
  );
}
