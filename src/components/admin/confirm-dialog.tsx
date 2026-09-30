"use client";

/**
 * Boîte de confirmation (suppression, actions irréversibles)
 */

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-[rgba(5,5,5,0.8)] p-5"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-[420px] rounded-2xl border border-[#444] bg-[#141414] p-7 text-center shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-[1.15rem] font-bold">{title}</h3>
        <p className="mb-6 mt-2 text-[0.86rem] leading-relaxed text-[#a0a0a0]">{message}</p>
        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className="btn-arsenal btn-ghost flex-1">
            Annuler
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} className="btn-arsenal btn-danger flex-1">
            {busy && <span className="spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
