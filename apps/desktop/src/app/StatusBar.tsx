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

  const connectionDetails = [
    t("status.api", { value: getDefaultApiBaseUrl() || "/api proxy" }),
    t("status.ws", { value: getDefaultWsBaseUrl() }),
    t("status.ui")
  ].join(" · ");

  return (
    <footer className="status-bar" title={connectionDetails}>
      <span className="status-bar__item">
        <span
          className={state.error === null ? "status-bar__dot is-ready" : "status-bar__dot is-error"}
          aria-hidden="true"
        />
        {serverText}
      </span>
      <span>{t("status.localData")}</span>
    </footer>
  );
}
