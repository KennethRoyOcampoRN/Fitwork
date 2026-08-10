import React, { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";

interface UserRow {
  id: string;
  username: string;
  fullName: string;
  role: string;
  licenseNumber: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
}

const ROLES = ["ADMIN", "DOCTOR", "DENTIST", "NURSE"];

export default function AdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [form, setForm] = useState({ username: "", fullName: "", role: "NURSE", licenseNumber: "", initialPassword: "" });
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setUsers(await api.get<UserRow[]>("/users"));
  }
  useEffect(() => { load(); }, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/users", form);
      setForm({ username: "", fullName: "", role: "NURSE", licenseNumber: "", initialPassword: "" });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create user");
    }
  }

  async function toggleActive(u: UserRow) {
    await api.patch(`/users/${u.id}`, { isActive: !u.isActive });
    await load();
  }

  async function resetPassword(u: UserRow) {
    const pw = prompt(`New password for ${u.username} (min 10 chars):`);
    if (!pw) return;
    try {
      await api.post(`/users/${u.id}/reset-password`, { newPassword: pw });
      alert("Password reset. User must change it on next login.");
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Could not reset password");
    }
  }

  return (
    <div>
      <h1 className="text-lg font-semibold mb-4">User management</h1>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <form onSubmit={createUser} className="bg-white border rounded-xl p-4 space-y-2 lg:col-span-1">
          <h2 className="font-medium mb-2">Create account</h2>
          <input placeholder="Username" className="w-full border rounded px-2 py-1 text-sm" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
          <input placeholder="Full name" className="w-full border rounded px-2 py-1 text-sm" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
          <select className="w-full border rounded px-2 py-1 text-sm" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <input placeholder="License number (optional)" className="w-full border rounded px-2 py-1 text-sm" value={form.licenseNumber} onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })} />
          <input placeholder="Initial password (min 10 chars)" type="password" className="w-full border rounded px-2 py-1 text-sm" value={form.initialPassword} onChange={(e) => setForm({ ...form, initialPassword: e.target.value })} required minLength={10} />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button className="w-full bg-clinic-600 text-white rounded py-1.5 text-sm">Create</button>
        </form>

        <div className="bg-white border rounded-xl lg:col-span-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr><th className="p-2">Name</th><th className="p-2">Role</th><th className="p-2">Last login</th><th className="p-2">Status</th><th className="p-2"></th></tr>
            </thead>
            <tbody className="divide-y">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="p-2">{u.fullName} <span className="text-gray-400">({u.username})</span></td>
                  <td className="p-2">{u.role}</td>
                  <td className="p-2">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "Never"}</td>
                  <td className="p-2">{u.isActive ? <span className="text-green-700">Active</span> : <span className="text-gray-400">Inactive</span>}</td>
                  <td className="p-2 space-x-2 whitespace-nowrap">
                    <button
                      onClick={() => toggleActive(u)}
                      className={u.isActive
                        ? "border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 rounded px-2 py-1 text-xs font-medium transition-colors"
                        : "text-xs text-clinic-300 underline"}
                    >
                      {u.isActive ? "Deactivate" : "Reactivate"}
                    </button>
                    <button onClick={() => resetPassword(u)} className="text-xs text-clinic-300 underline">Reset password</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
