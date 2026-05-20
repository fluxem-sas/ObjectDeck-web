import { useCallback, useState } from "react";

export type Toast = {
  id: string;
  type: "ok" | "error" | "info";
  text: string;
};

const DISMISS_DELAY_MS = 4000;

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((type: Toast["type"], text: string) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(
      () => setToasts((prev) => prev.filter((t) => t.id !== id)),
      DISMISS_DELAY_MS
    );
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, addToast, dismissToast };
}
