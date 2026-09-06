import { JsonPreview } from "./JsonPreview";
import { useI18n } from "../i18n/I18nProvider";

export interface AndroidCommandStatusTableProps {
  health: unknown;
}

export function AndroidCommandStatusTable({ health }: AndroidCommandStatusTableProps) {
  const { t } = useI18n();
  if (health === null || health === undefined) {
    return null;
  }

  return (
    <section className="panel" aria-label={t("tools.androidCommandStatus")}>
      <h2>{t("tools.androidHealth")}</h2>
      <JsonPreview value={health} />
    </section>
  );
}
