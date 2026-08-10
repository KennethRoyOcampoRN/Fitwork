import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../lib/api";

interface ArchivedEmployee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  department: string | null;
  company: { id: string; name: string } | null;
  updatedAt: string;
}

export default function AdminArchivedEmployees() {
  const [employees, setEmployees] = useState<ArchivedEmployee[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setEmployees(await api.get<ArchivedEmployee[]>("/employees/archived"));
  }
  useEffect(() => { load(); }, []);

  async function restore(id: string) {
    setBusyId(id);
    try {
      await api.post(`/employees/${id}/restore`, {});
      await load();
    } finally {
      setBusyId(null);
    }
  }

  // Reserved for genuine mistakes (duplicate/wrongly created records) — the
  // server independently re-checks the confirmation text and blocks this
  // with a 409 if any clinical notes, medications, documents, vitals, or
  // APE records are attached, so this prompt is convenience, not the guard.
  async function deletePermanently(e: ArchivedEmployee) {
    const confirmText = prompt(
      `This permanently deletes ${e.lastName}, ${e.firstName} (#${e.employeeCode}) and cannot be undone.\n\n` +
      `This only works if the record has no clinical history attached — otherwise leave it archived.\n\n` +
      `Type the employee code or full name to confirm:`
    );
    if (!confirmText) return;
    setBusyId(e.id);
    try {
      await api.delete(`/employees/${e.id}`, { confirmText });
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Could not delete employee");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h1 className="text-lg font-semibold mb-2">Archived Employees</h1>
      <p className="text-sm text-gray-500 mb-4">
        Archived employees are hidden from search and normal lists, but their clinical history, notes, and audit
        trail remain intact. Restoring returns a record to active use.
      </p>
      <div className="bg-white border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="p-2">Employee</th><th className="p-2">Code</th><th className="p-2">Department</th>
              <th className="p-2">Company</th><th className="p-2">Archived</th><th className="p-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {employees.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-gray-400">No archived employees.</td></tr>}
            {employees.map((e) => (
              <tr key={e.id}>
                <td className="p-2">
                  <Link to={`/employees/${e.id}`} className="text-clinic-300 underline">{e.lastName}, {e.firstName}</Link>
                </td>
                <td className="p-2">{e.employeeCode}</td>
                <td className="p-2">{e.department || "—"}</td>
                <td className="p-2">{e.company?.name || "—"}</td>
                <td className="p-2">{new Date(e.updatedAt).toLocaleString()}</td>
                <td className="p-2 space-x-3 whitespace-nowrap">
                  <button onClick={() => restore(e.id)} disabled={busyId === e.id} className="text-xs text-clinic-300 underline disabled:opacity-50">
                    {busyId === e.id ? "Restoring..." : "Restore"}
                  </button>
                  <button onClick={() => deletePermanently(e)} disabled={busyId === e.id} className="text-xs text-red-800 underline disabled:opacity-50">
                    Delete permanently
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
