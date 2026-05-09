import { AppShell } from "./app/AppShell";
import { I18nProvider } from "./i18n/I18nProvider";

export function App() {
  return (
    <I18nProvider>
      <AppShell />
    </I18nProvider>
  );
}
