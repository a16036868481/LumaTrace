import type { ToastMessage } from "../hooks/useToasts";
import { useI18n } from "../i18n/I18nProvider";

export function ToastList({
  toasts,
  onDismiss
}: {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}) {
  const { t } = useI18n();

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="toast-stack" aria-live="polite" aria-label={t("common.notifications")}>
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.tone}`}>
          <span>{toast.message}</span>
          <button
            aria-label={t("common.dismissNotification", { message: toast.message })}
            className="button button-compact"
            type="button"
            onClick={() => onDismiss(toast.id)}
          >
            {t("common.dismiss")}
          </button>
        </div>
      ))}
    </div>
  );
}
