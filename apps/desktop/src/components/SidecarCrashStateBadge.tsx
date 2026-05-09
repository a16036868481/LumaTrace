import type { SidecarStatus } from "../tauri/sidecarStatus";

interface SidecarCrashStateBadgeProps {
  status: SidecarStatus | null;
}

export function SidecarCrashStateBadge({ status }: SidecarCrashStateBadgeProps) {
  return <span className="status-pill">crash state: {status?.status ?? "N/A"}</span>;
}
