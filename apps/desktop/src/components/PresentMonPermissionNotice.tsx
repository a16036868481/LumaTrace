interface PresentMonPermissionNoticeProps {
  active?: boolean;
}

export function PresentMonPermissionNotice({ active = true }: PresentMonPermissionNoticeProps) {
  if (!active) {
    return null;
  }
  return (
    <div className="panel" role="note" aria-label="PresentMon permission notice">
      <h2>PresentMon Permissions</h2>
      <p>
        PresentMon may report limited data for cross-user or short-lived processes. Windows
        Windows log access group membership or normal elevation can help in some environments, but
        LumaTrace does not bypass permissions.
      </p>
    </div>
  );
}
