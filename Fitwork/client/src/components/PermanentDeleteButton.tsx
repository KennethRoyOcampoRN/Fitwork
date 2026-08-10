import React, { useState } from "react";
import { ApiError } from "../lib/api";
import { IconTrash } from "./icons";
import ConfirmModal from "./ConfirmModal";

// Shared admin-only "delete permanently" control for clinical records
// (notes, vitals, medications, documents, APE) — reused across every tab
// instead of a per-tab confirm() prompt, since this action is higher-stakes
// (no archive/restore, no undo) and needs both a specific description of
// what's being deleted and a required reason, not just a yes/no confirm.
export default function PermanentDeleteButton({
  description,
  onDelete,
  fullWidth = false,
}: {
  description: string;
  onDelete: (reason: string) => Promise<void>;
  // Stretches the trigger to fill its container instead of shrinking to
  // its text — for stacked-button layouts (e.g. Labs & Documents cards)
  // where this needs to match a sibling Archive button's width exactly,
  // rather than being sized to "Delete" alone.
  fullWidth?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!reason.trim()) {
      setError("A reason is required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onDelete(reason.trim());
      setOpen(false);
      setReason("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1 whitespace-nowrap bg-[#D33B3B] hover:bg-[#B93232] text-white rounded px-2 py-1 text-xs font-medium transition-colors ${
          fullWidth ? "w-full justify-center" : "shrink-0"
        }`}
      >
        <IconTrash className="w-3 h-3" /> Delete
      </button>
      {open && (
        <ConfirmModal
          title="Permanently delete this record?"
          danger
          confirmLabel={busy ? "Deleting..." : "Delete"}
          busy={busy}
          onConfirm={confirm}
          onCancel={() => setOpen(false)}
        >
          <p className="text-sm text-gray-700 mb-3">{description}</p>
          <p className="text-xs text-gray-500 mb-3">
            This cannot be undone — there is no archive/restore for this action. The record will be removed
            entirely; a permanent trace (who, what, when, and why) is kept in the Audit Log.
          </p>
          <label className="block text-sm font-medium mb-1">Reason for deletion (required)</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="w-full border rounded px-2 py-1 text-sm mb-2"
            autoFocus
          />
          {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
        </ConfirmModal>
      )}
    </>
  );
}
