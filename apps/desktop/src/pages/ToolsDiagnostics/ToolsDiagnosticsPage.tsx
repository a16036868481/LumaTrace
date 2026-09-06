import { getDevices, getToolsStatus } from "../../api/endpoints";
import { BugReportPanel } from "../../components/BugReportPanel";
import { useI18n } from "../../i18n/I18nProvider";
import { detectTauri, restartSidecar } from "../../tauri/tauriClient";

export function ToolsDiagnosticsPage() {
  const { t } = useI18n();

  async function handleRepair(): Promise<void> {
    if (detectTauri()) {
      await restartSidecar();
    }
    await Promise.all([getDevices(), getToolsStatus()]);
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>{t("support.title")}</h1>
          <p>{t("support.body")}</p>
        </div>
      </header>

      <BugReportPanel onRepair={handleRepair} />
    </div>
  );
}
