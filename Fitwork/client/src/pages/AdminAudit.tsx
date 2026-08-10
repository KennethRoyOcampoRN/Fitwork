import React, { useEffect, useState } from "react";
import { api } from "../lib/api";

interface AuditLog {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  ipAddress: string | null;
  detailsJson: string | null;
  createdAt: string;
  user: { username: string; fullName: string } | null;
  employee: { employeeCode: string; firstName: string; lastName: string } | null;
}

const ACTIONS = [
  "LOGIN", "LOGIN_FAILED", "LOGOUT", "VIEW_RECORD", "CREATE_NOTE", "EDIT_NOTE", "ADD_ADDENDUM",
  "VOID_NOTE", "UPLOAD_DOC", "DOWNLOAD_DOC", "ARCHIVE_DOC", "CREATE_USER", "UPDATE_USER",
  "DEACTIVATE_USER", "RESET_PASSWORD", "IMPORT_RUN", "BACKUP_RUN", "CREATE_EMPLOYEE",
  "UPDATE_EMPLOYEE", "RECORD_VITALS", "LOG_MEDICATION",
  "ARCHIVE_EMPLOYEE", "RESTORE_EMPLOYEE", "CREATE_COMPANY", "DELETE_EMPLOYEE",
  "UPDATE_BRANDING", "UPDATE_TOOTH_RECORD",
];

export default function AdminAudit() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [filters, setFilters] = useState({ action: "", employeeCode: "", from: "", to: "" });
  const [loading, setLoading] = useState(true);

  function buildQuery() {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
    return params.toString();
  }

  async function load() {
    setLoading(true);
    setLogs(await api.get<AuditLog[]>(`/audit?${buildQuery()}`));
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h2 className="font-medium">Audit log</h2>
        <a href={`/api/audit/export.csv?${buildQuery()}`} className="bg-clinic-600 text-white rounded px-3 py-1.5 text-sm">Export CSV</a>
      </div>

      <div className="bg-white border rounded-xl p-3 mb-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
        <select value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })} className="border rounded px-2 py-1">
          <option value="">All actions</option>
          {ACTIONS.map((a) => <option key={a} value={a}>{a.replace(/_/g, " ")}</option>)}
        </select>
        <input placeholder="Employee code" value={filters.employeeCode} onChange={(e) => setFilters({ ...filters, employeeCode: e.target.value })} className="border rounded px-2 py-1" />
        <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} className="border rounded px-2 py-1" />
        <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} className="border rounded px-2 py-1" />
        <button onClick={load} className="col-span-2 sm:col-span-1 bg-gray-100 rounded px-2 py-1">Apply filters</button>
      </div>

      <div className="bg-white border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr><th className="p-2">Time</th><th className="p-2">User</th><th className="p-2">Action</th><th className="p-2">Entity</th><th className="p-2">Employee</th><th className="p-2">IP</th></tr>
          </thead>
          <tbody className="divide-y">
            {loading && <tr><td colSpan={6} className="p-4 text-center text-gray-400">Loading...</td></tr>}
            {!loading && logs.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-gray-400">No matching audit entries.</td></tr>}
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="p-2 whitespace-nowrap">{new Date(l.createdAt).toLocaleString()}</td>
                <td className="p-2">{l.user ? `${l.user.fullName}` : "—"}</td>
                <td className="p-2">{l.action.replace(/_/g, " ")}</td>
                <td className="p-2">{l.entityType || "—"}</td>
                <td className="p-2">{l.employee ? `${l.employee.lastName}, ${l.employee.firstName} (${l.employee.employeeCode})` : "—"}</td>
                <td className="p-2">{l.ipAddress || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
