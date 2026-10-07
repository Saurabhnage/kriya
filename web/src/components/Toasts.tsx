"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { friendlyError } from "@/lib/errors";

type Toast = { id: number; tone: "success" | "error" | "info"; message: string; link?: { label: string; href: string } };
type ToastApi = { success: (m: string) => void; info: (m: string) => void; error: (err: unknown) => void };

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = Date.now() + Math.random();
      setToasts((list) => [...list.slice(-3), { ...t, id }]);
      if (t.tone !== "error") setTimeout(() => dismiss(id), 6000);
    },
    [dismiss],
  );
  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push({ tone: "success", message }),
      info: (message) => push({ tone: "info", message }),
      error: (err) => push({ tone: "error", ...friendlyError(err) }),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed top-4 right-4 z-50 flex w-[min(380px,calc(100vw-32px))] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={`toast-in pointer-events-auto rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur ${
              t.tone === "error"
                ? "border-danger/40 bg-[#1d0f13]/95 text-ink"
                : t.tone === "success"
                  ? "border-accent/40 bg-[#0d1a16]/95 text-ink"
                  : "border-line bg-panel/95 text-ink"
            }`}
          >
            <div className="flex items-start gap-3">
              <span aria-hidden className={t.tone === "error" ? "text-danger" : t.tone === "success" ? "text-accent" : "text-accent-2"}>
                {t.tone === "error" ? "✗" : t.tone === "success" ? "✓" : "●"}
              </span>
              <p className="flex-1">
                {t.message}
                {t.link && (
                  <a href={t.link.href} target="_blank" rel="noreferrer" className="ml-2 text-accent-2 underline">
                    {t.link.label}
                  </a>
                )}
              </p>
              <button aria-label="Dismiss" className="text-muted hover:text-ink" onClick={() => dismiss(t.id)}>
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
