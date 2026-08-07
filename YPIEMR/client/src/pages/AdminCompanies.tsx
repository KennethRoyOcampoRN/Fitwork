import React, { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";

interface Company {
  id: string;
  name: string;
  shortCode: string | null;
  isPrimary: boolean;
  isActive: boolean;
  employeeCount: number;
}

export default function AdminCompanies() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [name, setName] = useState("");
  const [shortCode, setShortCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);

  async function load() {
    setCompanies(await api.get<Company[]>("/companies"));
  }
  useEffect(() => { load(); }, []);

  async function createCompany(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/companies", { name: name.trim(), shortCode: shortCode.trim() || undefined });
      setName("");
      setShortCode("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create company");
    } finally {
      setBusy(false);
    }
  }

  async function setPrimary(id: string) {
    setRowBusyId(id);
    setError(null);
    try {
      await api.post(`/companies/${id}/set-primary`, {});
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not set primary company");
    } finally {
      setRowBusyId(null);
    }
  }

  async function toggleActive(c: Company) {
    setRowBusyId(c.id);
    setError(null);
    try {
      await api.patch(`/companies/${c.id}`, { isActive: !c.isActive });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update company");
    } finally {
      setRowBusyId(null);
    }
  }

  return (
    <div>
      <h1 className="text-lg font-semibold mb-4">Companies</h1>
      <p className="text-sm text-gray-500 mb-4">
        The clinic serves employees from one or more companies — add them here so they can be selected on the
        Add/Edit Employee form and used for import defaults and report scoping. Exactly one company is marked
        Primary at a time; it's the default for new employees and the scope reports fall back to.
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <form onSubmit={createCompany} className="bg-white border rounded-lg p-4 space-y-2 lg:col-span-1">
          <h2 className="font-medium mb-2">Add company</h2>
          <input
            placeholder="Company name"
            className="w-full border rounded px-2 py-1 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            placeholder="Short code (optional)"
            className="w-full border rounded px-2 py-1 text-sm"
            value={shortCode}
            onChange={(e) => setShortCode(e.target.value)}
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button disabled={busy} className="w-full bg-clinic-600 text-white rounded py-1.5 text-sm disabled:opacity-50">
            {busy ? "Adding..." : "Add"}
          </button>
        </form>

        <div className="bg-white border rounded-lg lg:col-span-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr><th className="p-2">Name</th><th className="p-2">Code</th><th className="p-2">Employees</th><th className="p-2">Status</th><th className="p-2"></th></tr>
            </thead>
            <tbody className="divide-y">
              {companies.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-gray-400">No companies added yet.</td></tr>}
              {companies.map((c) => (
                <tr key={c.id}>
                  <td className="p-2">{c.name}{c.isPrimary && <span className="ml-2 text-xs bg-clinic-100 text-clinic-700 px-1.5 py-0.5 rounded">Primary</span>}</td>
                  <td className="p-2">{c.shortCode || "—"}</td>
                  <td className="p-2">{c.employeeCount}</td>
                  <td className="p-2">{c.isActive ? "Active" : "Inactive"}</td>
                  <td className="p-2 text-right space-x-2">
                    {!c.isPrimary && (
                      <button
                        onClick={() => setPrimary(c.id)}
                        disabled={rowBusyId === c.id || !c.isActive}
                        className="text-xs text-clinic-700 underline disabled:opacity-50 disabled:no-underline"
                        title={!c.isActive ? "An inactive company cannot be made primary" : undefined}
                      >
                        Make primary
                      </button>
                    )}
                    {!c.isPrimary && (
                      <button
                        onClick={() => toggleActive(c)}
                        disabled={rowBusyId === c.id}
                        className="text-xs text-gray-600 underline disabled:opacity-50"
                      >
                        {c.isActive ? "Deactivate" : "Reactivate"}
                      </button>
                    )}
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
