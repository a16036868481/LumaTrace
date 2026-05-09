import { useCallback, useState } from "react";
import { createClientId } from "../utils/ids";

export type ToastTone = "info" | "success" | "error";

export interface ToastMessage {
  id: string;
  tone: ToastTone;
  message: string;
}

export function useToasts() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dismissToast = useCallback((id: string): void => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((message: string, tone: ToastTone = "info"): void => {
    const toast: ToastMessage = {
      id: createClientId("toast"),
      tone,
      message
    };
    setToasts((current) => [toast, ...current].slice(0, 4));
  }, []);

  return {
    toasts,
    showToast,
    dismissToast
  };
}
