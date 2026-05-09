import { useI18n } from "../i18n/I18nProvider";

export function LoadingState({ label }: { label?: string }) {
  const { t } = useI18n();
  return <div className="loading-state">{label ?? t("common.loading")}</div>;
}
