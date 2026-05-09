import type { Target } from "../api/types";

function processNameFromTarget(target: Target): string {
  const processName = target.tags?.processName;
  return typeof processName === "string" && processName.length > 0 ? processName : target.name;
}

function processPidFromTarget(target: Target): string | null {
  const pid = target.pid ?? target.tags?.pid;
  return typeof pid === "number" || typeof pid === "string" ? String(pid) : null;
}

function processPathFromTarget(target: Target): string | null {
  return typeof target.executablePath === "string" && target.executablePath.length > 0
    ? target.executablePath
    : null;
}

function iconDataUrlFromTarget(target: Target): string | null {
  const iconDataUrl = target.tags?.iconDataUrl ?? target.tags?.iconUrl;
  return typeof iconDataUrl === "string" && iconDataUrl.startsWith("data:image/")
    ? iconDataUrl
    : null;
}

function fallbackLetters(name: string): string {
  const cleaned = name.replace(/\.(exe|app)$/i, "").replace(/[^a-z0-9]/gi, "");
  if (cleaned.length === 0) {
    return "A";
  }
  return cleaned.slice(0, 2).toUpperCase();
}

export interface ProcessTargetPickerProps {
  disabled?: boolean;
  emptyMessage: string;
  formatTarget: (target: Target) => string;
  label: string;
  onChange: (targetId: string) => void;
  targets: Target[];
  value: string;
}

export function ProcessTargetPicker({
  disabled = false,
  emptyMessage,
  formatTarget,
  label,
  onChange,
  targets,
  value
}: ProcessTargetPickerProps) {
  return (
    <div className="process-picker">
      <span className="process-picker__label">{label}</span>
      <div aria-label={label} className="process-picker__list" role="listbox">
        {targets.length === 0 ? (
          <div className="process-picker__empty">{emptyMessage}</div>
        ) : (
          targets.map((target) => {
            const selected = target.id === value;
            const iconDataUrl = iconDataUrlFromTarget(target);
            const processName = processNameFromTarget(target);
            const pid = processPidFromTarget(target);
            const path = processPathFromTarget(target);
            const metaParts = [
              pid === null ? null : `PID ${pid}`,
              path === null ? null : path.split(/[\\/]/).pop() ?? path
            ].filter((item): item is string => item !== null);
            return (
              <button
                key={target.id}
                aria-selected={selected}
                className={`process-picker__option${selected ? " is-selected" : ""}`}
                disabled={disabled}
                role="option"
                type="button"
                onClick={() => onChange(target.id)}
              >
                <span className="process-picker__icon" aria-hidden="true">
                  {iconDataUrl === null ? (
                    <span className="process-picker__icon-fallback">{fallbackLetters(processName)}</span>
                  ) : (
                    <img alt="" src={iconDataUrl} />
                  )}
                </span>
                <span className="process-picker__text">
                  <span className="process-picker__name">{formatTarget(target)}</span>
                  {metaParts.length === 0 ? null : (
                    <span className="process-picker__meta">{metaParts.join(" · ")}</span>
                  )}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
