import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { IconAlertTriangle } from "./icons";

// Shared chrome for every destructive/blocking confirmation in the app —
// replaces native confirm()/prompt() (which render as an unbrandable
// "localhost:5173 says" browser dialog) and the assorted one-off custom
// modals that predated this component. Portaled to document.body rather
// than rendered inline: a modal nested inside a card that has its own
// backdrop-filter (every `.bg-white` glass card does) is trapped inside
// that card's stacking context, so position:fixed + a high z-index alone
// isn't enough to guarantee it paints above *other* cards on the page —
// which is exactly the bug this fixes. Portaling to body sidesteps the
// stacking-context trap entirely instead of chasing z-index values.
//
// This component owns only the shell (backdrop, "FitWork Warning" header,
// title, Cancel/Confirm footer) — callers supply the body via children
// (a description, a reason textarea, a typed-confirmation input, a
// password field, or nothing at all for a plain yes/no), so one place
// governs the branding/behavior while each call site keeps its own
// specific content and validation.
export default function ConfirmModal({
  title,
  danger = false,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  busy = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
  children,
}: {
  title: string;
  danger?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [busy, onCancel]);

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className={`flex items-center gap-2 px-4 py-2 border-b ${danger ? "bg-red-50 border-red-100" : "bg-amber-50 border-amber-100"}`}>
          <IconAlertTriangle className={`w-4 h-4 shrink-0 ${danger ? "text-red-700" : "text-amber-700"}`} />
          <span className={`text-xs font-semibold uppercase tracking-wide ${danger ? "text-red-700" : "text-amber-700"}`}>
            FitWork Warning
          </span>
        </div>
        <div className="p-4">
          <h2 className={`font-semibold mb-2 ${danger ? "text-red-800" : "text-amber-800"}`}>{title}</h2>
          {children}
        </div>
        <div className="flex justify-end gap-2 px-4 pb-4">
          <button onClick={onCancel} disabled={busy} className="px-4 py-2 text-sm disabled:opacity-50">
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
            className={`${danger ? "bg-red-700 hover:bg-red-800" : "bg-amber-700 hover:bg-amber-800"} text-white rounded px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
