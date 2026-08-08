import React, { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";

interface TestType {
  id: string;
  name: string;
  isActive: boolean;
}

export default function AdminTestTypes() {
  const [types, setTypes] = useState<TestType[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);

  async function load() {
    setTypes(await api.get<TestType[]>("/test-types"));
  }
  useEffect(() => { load(); }, []);

  async function createType(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/test-types", { name: name.trim() });
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create test type");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(t: TestType) {
    setRowBusyId(t.id);
    setError(null);
    try {
      await api.patch(`/test-types/${t.id}`, { isActive: !t.isActive });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update test type");
    } finally {
      setRowBusyId(null);
    }
  }

  return (
    <div>
      <h1 className="text-lg font-semibold mb-4">Lab/Diagnostic Test Types</h1>
      <p className="text-sm text-gray-500 mb-4">
        Manages the "Test type" dropdown on the Lab/Diagnostic Tests tab of an employee's record. Deactivating a
        type removes it from the dropdown for new entries without touching any test results already recorded
        against it.
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <form onSubmit={createType} className="bg-white border rounded-xl p-4 space-y-2 lg:col-span-1">
          <h2 className="font-medium mb-2">Add test type</h2>
          <input
            placeholder="e.g. Chest X-ray"
            className="w-full border rounded px-2 py-1 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button disabled={busy} className="w-full bg-clinic-600 text-white rounded py-1.5 text-sm disabled:opacity-50">
            {busy ? "Adding..." : "Add"}
          </button>
        </form>

        <div className="bg-white border rounded-xl lg:col-span-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr><th className="p-2">Name</th><th className="p-2">Status</th><th className="p-2"></th></tr>
            </thead>
            <tbody className="divide-y">
              {types.length === 0 && <tr><td colSpan={3} className="p-4 text-center text-gray-400">No test types added yet.</td></tr>}
              {types.map((t) => (
                <tr key={t.id}>
                  <td className="p-2">{t.name}</td>
                  <td className="p-2">{t.isActive ? "Active" : "Inactive"}</td>
                  <td className="p-2 text-right">
                    <button
                      onClick={() => toggleActive(t)}
                      disabled={rowBusyId === t.id}
                      className="text-xs text-clinic-300 underline disabled:opacity-50"
                    >
                      {t.isActive ? "Deactivate" : "Reactivate"}
                    </button>
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
