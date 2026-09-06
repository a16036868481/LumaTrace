import { useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { openBugReportPage } from "../tauri/tauriClient";

interface BugReportPanelProps {
  onRepair: () => Promise<void>;
}

type ActionStatus = "idle" | "repairing" | "repaired" | "repair_failed" | "submit_failed";

export function BugReportPanel({ onRepair }: BugReportPanelProps) {
  const { t } = useI18n();
  const [status, setStatus] = useState<ActionStatus>("idle");

  async function handleRepair(): Promise<void> {
    setStatus("repairing");
    try {
      await onRepair();
      setStatus("repaired");
    } catch {
      setStatus("repair_failed");
    }
  }

  async function handleSubmitBug(): Promise<void> {
    try {
      await openBugReportPage();
    } catch {
      setStatus("submit_failed");
    }
  }

  const statusMessage =
    status === "repairing"
      ? t("support.repairingHelp")
      : status === "repaired"
        ? t("support.repairSuccess")
        : status === "repair_failed"
          ? t("support.repairFailed")
          : status === "submit_failed"
            ? t("support.submitFailed")
            : null;

  return (
    <section className="panel support-panel" aria-label={t("support.title")}>
      <div className="support-panel__actions">
        <button
          aria-label={status === "repairing" ? t("support.repairing") : t("support.repair")}
          className="support-action support-action--repair"
          type="button"
          disabled={status === "repairing"}
          onClick={() => void handleRepair()}
        >
          <span className="support-action__icon" aria-hidden="true">
            {status === "repairing" ? <span className="support-action__spinner" /> : "↻"}
          </span>
          <span className="support-action__copy">
            <strong>
              {status === "repairing" ? t("support.repairing") : t("support.repair")}
            </strong>
            <span>{t("support.repairDescription")}</span>
          </span>
          <span className="support-action__arrow" aria-hidden="true">
            →
          </span>
        </button>
        <button
          aria-label={t("support.submitBug")}
          className="support-action support-action--submit"
          type="button"
          onClick={() => void handleSubmitBug()}
        >
          <span className="support-action__icon" aria-hidden="true">
            !
          </span>
          <span className="support-action__copy">
            <strong>{t("support.submitBug")}</strong>
            <span>{t("support.submitDescription")}</span>
          </span>
          <span className="support-action__arrow" aria-hidden="true">
            →
          </span>
        </button>
      </div>
      {statusMessage !== null ? (
        <p
          className={`support-panel__status${status === "repaired" ? " is-success" : ""}`}
          aria-live="polite"
        >
          {statusMessage}
        </p>
      ) : null}
    </section>
  );
}
