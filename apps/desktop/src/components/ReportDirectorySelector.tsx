import { useEffect, useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import {
  chooseReportOutputDirectory,
  detectTauri,
  getAppPaths,
  openReportsDirectory
} from "../tauri/tauriClient";

export function ReportDirectorySelector() {
  const { t } = useI18n();
  const [directory, setDirectory] = useState<string | null>(null);
  const [busy, setBusy] = useState<"choose" | "open" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isTauri = detectTauri();

  useEffect(() => {
    if (!isTauri) {
      return;
    }
    let active = true;
    void getAppPaths()
      .then((paths) => {
        if (active) {
          setDirectory(paths.reportsDirSanitized);
        }
      })
      .catch(() => {
        if (active) {
          setError(t("session.reportOutputDirChangeFailed"));
        }
      });
    return () => {
      active = false;
    };
  }, [isTauri, t]);

  if (!isTauri) {
    return null;
  }

  const chooseDirectory = async (): Promise<void> => {
    setBusy("choose");
    setError(null);
    try {
      const result = await chooseReportOutputDirectory();
      if (!result.cancelled && result.reportsDirSanitized !== undefined) {
        setDirectory(result.reportsDirSanitized);
      }
    } catch {
      setError(t("session.reportOutputDirChangeFailed"));
    } finally {
      setBusy(null);
    }
  };

  const openDirectory = async (): Promise<void> => {
    setBusy("open");
    setError(null);
    try {
      await openReportsDirectory();
    } catch {
      setError(t("session.reportOutputDirOpenFailed"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="report-directory-selector" aria-label={t("session.reportOutputDir")}>
      <span>{t("session.reportOutputDir")}</span>
      <strong title={directory ?? undefined}>
        {directory ?? t("session.reportOutputDirUnavailable")}
      </strong>
      <button
        className="report-directory-selector__primary"
        disabled={busy !== null}
        type="button"
        onClick={() => void chooseDirectory()}
      >
        {busy === "choose" ? t("session.settingReportOutputDir") : t("session.setReportOutputDir")}
      </button>
      <button
        className="report-directory-selector__secondary"
        disabled={busy !== null || directory === null}
        type="button"
        onClick={() => void openDirectory()}
      >
        {t("session.openReportOutputDir")}
      </button>
      {error === null ? null : <small role="alert">{error}</small>}
    </section>
  );
}
