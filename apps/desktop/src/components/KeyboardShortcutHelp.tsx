import { ConfirmDialog } from "./ConfirmDialog";

export function KeyboardShortcutHelp({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      title="Keyboard Shortcuts"
      message="S starts the selected session, X opens stop confirmation, M focuses the marker label, and ? opens this help. Shortcuts are ignored while typing in inputs."
      confirmLabel="Close"
      cancelLabel="Close"
      onConfirm={onClose}
      onCancel={onClose}
    />
  );
}
