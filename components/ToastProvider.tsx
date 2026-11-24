"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastVariant = "success" | "error" | "warning" | "info";

export interface ToastInput {
  title: string;
  description?: string;
  variant?: ToastVariant;
  durationMs?: number;
}

interface ToastItem extends Required<Pick<ToastInput, "title" | "variant">> {
  id: string;
  description?: string;
}

interface ToastContextValue {
  toast: (input: ToastInput) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const VARIANT_STYLES: Record<
  ToastVariant,
  { container: string; iconColor: string; titleColor: string; descColor: string }
> = {
  success: {
    container: "border-emerald-300 bg-emerald-50 text-emerald-950",
    iconColor: "text-emerald-700",
    titleColor: "text-emerald-950",
    descColor: "text-emerald-900",
  },
  error: {
    container: "border-rose-300 bg-rose-50 text-rose-950",
    iconColor: "text-rose-700",
    titleColor: "text-rose-950",
    descColor: "text-rose-900",
  },
  warning: {
    container: "border-amber-300 bg-amber-50 text-amber-950",
    iconColor: "text-amber-700",
    titleColor: "text-amber-950",
    descColor: "text-amber-900",
  },
  info: {
    container: "border-indigo-300 bg-indigo-50 text-indigo-950",
    iconColor: "text-indigo-700",
    titleColor: "text-indigo-950",
    descColor: "text-indigo-900",
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    ({ title, description, variant = "info", durationMs = 4800 }: ToastInput) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => [...prev.slice(-3), { id, title, description, variant }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== id));
      }, durationMs);
    },
    []
  );

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-label="System Notifications"
        className="pointer-events-none fixed bottom-4 right-4 left-4 z-50 flex flex-col items-end gap-2.5 sm:left-auto sm:w-full sm:max-w-sm"
      >
        {toasts.map((item) => {
          const style = VARIANT_STYLES[item.variant];
          return (
            <div
              key={item.id}
              role={item.variant === "error" ? "alert" : "status"}
              className={cn(
                "pointer-events-auto flex w-full items-start gap-3 rounded-xl border p-3.5 shadow-lg transition-all",
                style.container
              )}
            >
              {item.variant === "success" ? (
                <CheckCircle2
                  className={cn("mt-0.5 h-4 w-4 shrink-0", style.iconColor)}
                  aria-hidden="true"
                />
              ) : item.variant === "error" ? (
                <XCircle
                  className={cn("mt-0.5 h-4 w-4 shrink-0", style.iconColor)}
                  aria-hidden="true"
                />
              ) : item.variant === "warning" ? (
                <AlertTriangle
                  className={cn("mt-0.5 h-4 w-4 shrink-0", style.iconColor)}
                  aria-hidden="true"
                />
              ) : (
                <Info
                  className={cn("mt-0.5 h-4 w-4 shrink-0", style.iconColor)}
                  aria-hidden="true"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className={cn("text-xs font-bold", style.titleColor)}>{item.title}</p>
                {item.description && (
                  <p className={cn("mt-0.5 text-xs leading-snug", style.descColor)}>
                    {item.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                aria-label={`Dismiss notification: ${item.title}`}
                className="rounded-md p-1 text-slate-600 transition hover:bg-black/5 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
