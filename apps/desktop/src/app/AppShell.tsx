import { DashboardPage } from "../pages/Dashboard/DashboardPage";
import { DeviceDetailPage } from "../pages/DeviceDetail/DeviceDetailPage";
import { ReportPage } from "../pages/Report/ReportPage";
import { TestSessionPage } from "../pages/TestSession/TestSessionPage";
import { ToolsDiagnosticsPage } from "../pages/ToolsDiagnostics/ToolsDiagnosticsPage";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { Navigation } from "./Navigation";
import { StatusBar } from "./StatusBar";
import { useCurrentRoute } from "./routes";

function renderRoute(route: ReturnType<typeof useCurrentRoute>) {
  if (route === "device") {
    return <DeviceDetailPage />;
  }
  if (route === "session") {
    return <TestSessionPage />;
  }
  if (route === "report") {
    return <ReportPage />;
  }
  if (route === "tools") {
    return <ToolsDiagnosticsPage />;
  }
  return <DashboardPage />;
}

export function AppShell() {
  const route = useCurrentRoute();

  return (
    <div className="app-shell">
      <Navigation currentRoute={route} />
      <main className="app-main">
        <ErrorBoundary>{renderRoute(route)}</ErrorBoundary>
      </main>
      <StatusBar />
    </div>
  );
}
