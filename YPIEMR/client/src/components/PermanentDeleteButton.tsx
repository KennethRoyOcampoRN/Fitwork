import React, { useState } from "react";
import { ApiError } from "../lib/api";

// Shared admin-only "delete permanently" control for clinical records
// (notes, vitals, medications, documents, APE) — reused across every tab
// instead of a per-tab confirm() prompt, since this action is higher-stakes
// (no archive/restore, no undo) and needs both a specific description of
// what's being deleted and a required reason, not just a yes/no confirm.
export default function PermanentDeleteButton({
  description,
  onDelete,
}: {
  description: string;
  onDelete: (reason: string) => Promise<void>;
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
      <button onClick={() => setOpen(true)} className="text-xs text-red-800 underline">
        Delete permanently
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-5 w-full max-w-md">
            <h2 className="font-semibold mb-2 text-red-800">Permanently delete this record?</h2>
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
            <div className="flex justify-end gap-2">
              <button onClick={() => setOpen(false)} disabled={busy} className="px-4 py-2 text-sm">Cancel</button>
              <button onClick={confirm} disabled={busy} className="bg-red-700 text-white rounded px-4 py-2 text-sm disabled:opacity-50">
                {busy ? "Deleting..." : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
