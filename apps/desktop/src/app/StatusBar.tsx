import { useAsync } from "../hooks/useAsync";
import { health } from "../api/endpoints";
import { getDefaultApiBaseUrl } from "../api/client";
import { getDefaultWsBaseUrl } from "../api/websocket";
import { useI18n } from "../i18n/I18nProvider";

export function StatusBar() {
  const { t } = useI18n();
  const state = useAsync(() => health(), []);
  const serverText =
    state.error !== null
      ? t("status.serverUnavailable", { code: state.error.code })
      : state.data !== null
        ? t("status.serverReady", { status: state.data.status, version: state.data.version })
        : t("status.serverChecking");

  return (
    <footer className="status-bar">
      <span>{serverText}</span>
      <span>{t("status.api", { value: getDefaultApiBaseUrl() || "/api proxy" })}</span>
      <span>{t("status.ws", { value: getDefaultWsBaseUrl() })}</span>
      <span>{t("status.ui")}</span>
    </footer>
  );
}
