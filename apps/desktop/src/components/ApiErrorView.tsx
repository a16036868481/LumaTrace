import type { ApiError } from "../api/errors";
import { useI18n } from "../i18n/I18nProvider";

function getErrorTitle(error: ApiError, t: ReturnType<typeof useI18n>["t"]): string {
  if (error.code === "CLIENT_ERROR") {
    return t("error.clientError");
  }
  if (error.code === "TARGET_NOT_TEST_APP") {
    return t("error.androidSystemScreenTitle");
  }
  return error.code;
}

function getErrorMessage(error: ApiError, t: ReturnType<typeof useI18n>["t"]): string {
  const normalizedMessage = error.message.trim().toLowerCase();
  if (normalizedMessage === "failed to fetch" || normalizedMessage === "load failed") {
    return t("error.failedToFetch");
  }
  if (normalizedMessage === "unexpected client error.") {
    return t("error.unexpectedClientError");
  }
  if (error.code === "TARGET_NOT_TEST_APP") {
    return t("error.androidSystemScreenMessage");
  }
  return error.message;
}

export function ApiErrorView({ error }: { error: ApiError }) {
  const { t } = useI18n();

  return (
    <section className="error-view" role="alert">
      <h3>{getErrorTitle(error, t)}</h3>
      <p>{getErrorMessage(error, t)}</p>
      {error.details !== undefined ? (
        <details>
          <summary>{t("common.details")}</summary>
          <pre>{JSON.stringify(error.details, null, 2)}</pre>
        </details>
      ) : null}
    </section>
  );
}
