import { navItems, navigateTo, type AppRoute } from "./routes";
import { LanguageSelector } from "../components/LanguageSelector";
import { useI18n } from "../i18n/I18nProvider";

export function Navigation({ currentRoute }: { currentRoute: AppRoute }) {
  const { t } = useI18n();

  return (
    <nav className="app-nav" aria-label={t("nav.dashboard")}>
      <div className="app-nav__brand">
        <span>LumaTrace</span>
        <small>Beta</small>
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
      <LanguageSelector />
    </nav>
  );
}
