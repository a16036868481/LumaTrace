import { useEffect } from "react";
import { isEditableElement } from "../utils/accessibility";

export interface KeyboardShortcutHandlers {
  onStart?: () => void;
  onStop?: () => void;
  onFocusMarker?: () => void;
  onHelp?: () => void;
}

export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers, enabled = true): void {
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const listener = (event: KeyboardEvent): void => {
      if (isEditableElement(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        handlers.onStart?.();
      } else if (key === "x") {
        event.preventDefault();
        handlers.onStop?.();
      } else if (key === "m") {
        event.preventDefault();
        handlers.onFocusMarker?.();
      } else if (event.key === "?") {
        event.preventDefault();
        handlers.onHelp?.();
      }
    };

    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [enabled, handlers]);
}
