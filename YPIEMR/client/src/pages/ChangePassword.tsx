import React, { useState } from "react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";

export default function ChangePassword() {
  const { refresh } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirm) {
      setError("New passwords do not match");
      return;
    }
    setBusy(true);
    try {
      await api.post("/auth/change-password", { currentPassword, newPassword });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not change password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="w-full max-w-sm bg-white rounded-lg shadow p-8">
        <h1 className="text-xl font-bold mb-1">Change your password</h1>
        <p className="text-sm text-gray-500 mb-6">You must set a new password before continuing.</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <input type="password" placeholder="Current password" className="w-full border rounded px-3 py-2"
            value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          <input type="password" placeholder="New password (min 10 chars)" className="w-full border rounded px-3 py-2"
            value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={10} />
          <input type="password" placeholder="Confirm new password" className="w-full border rounded px-3 py-2"
            value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={10} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={busy} className="w-full bg-clinic-600 hover:bg-clinic-700 text-white rounded py-2 font-medium disabled:opacity-50">
            {busy ? "Saving..." : "Set new password"}
          </button>
        </form>
      </div>
    </div>
  );
}
