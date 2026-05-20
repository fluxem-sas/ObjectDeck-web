"use client";

import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

export type Toast = {
  id: string;
  type: "ok" | "error" | "info";
  text: string;
};

export function ToastStack({
  toasts,
  onDismiss
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col-reverse gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="animate-in fade-in slide-in-from-bottom-3 flex w-80 items-start gap-3 rounded-xl bg-od-text px-4 py-3 shadow-xl"
        >
          <div className="mt-0.5 shrink-0">
            {toast.type === "ok" && <CheckCircle2 className="size-4 text-green-400" aria-hidden />}
            {toast.type === "error" && <AlertCircle className="size-4 text-red-400" aria-hidden />}
            {toast.type === "info" && <Info className="size-4 text-blue-400" aria-hidden />}
          </div>
          <p className="flex-1 text-sm leading-5 text-white">{toast.text}</p>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            className="mt-0.5 shrink-0 text-white/50 transition-colors hover:text-white"
            aria-label="Cerrar notificación"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}
