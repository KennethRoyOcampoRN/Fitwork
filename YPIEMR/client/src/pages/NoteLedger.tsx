import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { DISPOSITIONS } from "../lib/noteTypes";

interface LedgerNote {
  id: string;
  visitDateTime: string;
  noteType: string;
  chiefComplaint: string | null;
  disposition: string | null;
  isWorkRelated: boolean;
  status: string;
  author: { fullName: string };
  employee: { id: string; employeeCode: string; firstName: string; lastName: string; department: string | null };
}

const NOTE_TYPES = ["DOCTOR", "NURSE", "DENTIST"];

export default function NoteLedger() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [notes, setNotes] = useState<LedgerNote[]>([]);
  const [filters, setFilters] = useState({
    noteType: searchParams.get("noteType") || "",
    department: "", isWorkRelated: "", disposition: "", from: "", to: "",
  });
  const [loading, setLoading] = useState(true);

  function buildQuery() {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
    return params.toString();
  }

  async function load() {
    setLoading(true);
    const data = await api.get<LedgerNote[]>(`/notes/ledger/list?${buildQuery()}`);
    setNotes(data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function exportXlsx() {
    window.location.href = `/api/notes/ledger/export?${buildQuery()}`;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-lg font-semibold">Note Ledger</h1>
        <button onClick={exportXlsx} className="bg-clinic-600 text-white rounded px-3 py-1.5 text-sm">Export to Excel</button>
      </div>

      <div className="bg-white border rounded-lg p-3 mb-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 text-sm">
        <select value={filters.noteType} onChange={(e) => setFilters({ ...filters, noteType: e.target.value })} className="border rounded px-2 py-1">
          <option value="">All types</option>
          {NOTE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input placeholder="Department" value={filters.department} onChange={(e) => setFilters({ ...filters, department: e.target.value })} className="border rounded px-2 py-1" />
        <select value={filters.disposition} onChange={(e) => setFilters({ ...filters, disposition: e.target.value })} className="border rounded px-2 py-1">
          <option value="">Any disposition</option>
          {DISPOSITIONS.map((d) => <option key={d} value={d}>{d.replace(/_/g, " ")}</option>)}
        </select>
        <select value={filters.isWorkRelated} onChange={(e) => setFilters({ ...filters, isWorkRelated: e.target.value })} className="border rounded px-2 py-1">
          <option value="">Work-related: any</option>
          <option value="true">Work-related only</option>
          <option value="false">Not work-related</option>
        </select>
        <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} className="border rounded px-2 py-1" />
        <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} className="border rounded px-2 py-1" />
        <button onClick={load} className="col-span-2 sm:col-span-1 bg-gray-100 rounded px-2 py-1">Apply filters</button>
      </div>

      <div className="bg-white border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="p-2">Date</th><th className="p-2">Employee</th><th className="p-2">Dept</th>
              <th className="p-2">Type</th><th className="p-2">Author</th><th className="p-2">Chief complaint</th>
              <th className="p-2">Disposition</th><th className="p-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading && <tr><td colSpan={8} className="p-4 text-center text-gray-400">Loading...</td></tr>}
            {!loading && notes.length === 0 && <tr><td colSpan={8} className="p-4 text-center text-gray-400">No notes match these filters.</td></tr>}
            {notes.map((n) => (
              <tr key={n.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/employees/${n.employee.id}?tab=${n.noteType.toLowerCase()}`)}>
                <td className="p-2">{new Date(n.visitDateTime).toLocaleDateString()}</td>
                <td className="p-2">{n.employee.lastName}, {n.employee.firstName} <span className="text-gray-400">({n.employee.employeeCode})</span></td>
                <td className="p-2">{n.employee.department || "—"}</td>
                <td className="p-2">{n.noteType}</td>
                <td className="p-2">{n.author.fullName}</td>
                <td className="p-2">{n.chiefComplaint || "—"}</td>
                <td className="p-2">{n.disposition?.replace(/_/g, " ") || "—"}</td>
                <td className="p-2">{n.status === "VOIDED" ? <span className="text-red-600">Voided</span> : "Final"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
