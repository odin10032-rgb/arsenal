"use client";

/**
 * Mini-système de toasts (module-level, sans dépendance)
 */

import { useEffect, useState } from "react";

export type ToastKind = "success" | "error" | "info";
type Listener = (message: string, kind: ToastKind) => void;

let listener: Listener | null = null;

export function toast(message: string, kind: ToastKind = "info"): void {
  listener?.(message, kind);
}

const KIND_STYLE: Record<ToastKind, { border: string; color: string; label: string }> = {
  success: { border: "rgba(42,157,143,0.5)", color: "#56b8a8", label: "✓" },
  error: { border: "rgba(230,57,70,0.5)", color: "#fda4af", label: "✕" },
  info: { border: "rgba(0,180,216,0.5)", color: "#4fb3d8", label: "i" },
};

/** À monter une fois (dashboard / pages) — rend les toasts en bas à droite */
export function ToastHost() {
  const [current, setCurrent] = useState<{ message: string; kind: ToastKind } | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    listener = (message, kind) => {
      setCurrent({ message, kind });
      clearTimeout(timer);
      timer = setTimeout(() => setCurrent(null), 3400);
    };
    return () => {
      listener = null;
      clearTimeout(timer);
    };
  }, []);

  if (!current) return null;
  const style = KIND_STYLE[current.kind];
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[200]">
      <div
        className="pointer-events-auto flex items-center gap-2.5 rounded-xl border bg-[#141414] px-4 py-3 text-[0.85rem] font-medium shadow-[0_16px_40px_rgba(0,0,0,0.5)]"
        style={{ borderColor: style.border }}
        role="status"
      >
        <span className="font-mono font-bold" style={{ color: style.color }}>
          {style.label}
        </span>
        {current.message}
      </div>
    </div>
  );
}
