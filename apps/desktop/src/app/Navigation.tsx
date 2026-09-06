import { navItems, navigateTo, type AppRoute } from "./routes";
import { LanguageSelector } from "../components/LanguageSelector";
import { ReportDirectorySelector } from "../components/ReportDirectorySelector";
import { useI18n } from "../i18n/I18nProvider";
import brandIcon from "../assets/lumatrace-mark.png";

export function Navigation({ currentRoute }: { currentRoute: AppRoute }) {
  const { t } = useI18n();

  return (
    <nav className="app-nav" aria-label={t("nav.dashboard")}>
      <div className="app-nav__brand">
        <img src={brandIcon} alt="" aria-hidden="true" />
        <span>
          <strong>LumaTrace</strong>
          <small>{t("app.tagline")}</small>
        </span>
      </div>
      {navItems.map((item) => (
        <a
          key={item.route}
          href={item.path}
          className={item.route === currentRoute ? "is-active" : undefined}
          onClick={(event) => {
            event.preventDefault();
            navigateTo(item.path);
          }}
        >
          {t(item.labelKey)}
        </a>
      ))}
      <div className="app-nav__utilities">
        <ReportDirectorySelector />
        <LanguageSelector />
      </div>
    </nav>
  );
}
