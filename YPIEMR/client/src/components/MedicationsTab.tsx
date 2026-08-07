import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import PermanentDeleteButton from "./PermanentDeleteButton";

interface MedLog {
  id: string;
  dispensedAt: string;
  drugName: string;
  strength: string | null;
  dosageForm: string | null;
  route: string | null;
  frequency: string | null;
  quantityDispensed: string | null;
  indication: string | null;
  remarks: string | null;
  isArchived: boolean;
  archiveReason: string | null;
  dispensedBy: { fullName: string };
}

const EMPTY = { drugName: "", strength: "", dosageForm: "", route: "", frequency: "", quantityDispensed: "", indication: "", remarks: "" };

export default function MedicationsTab({ employeeId, focusId }: { employeeId: string; focusId?: string | null }) {
  const { user } = useAuth();
  const [logs, setLogs] = useState<MedLog[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLogs(await api.get<MedLog[]>(`/medications?employeeId=${employeeId}`));
  }
  useEffect(() => { load(); }, [employeeId]);

  useEffect(() => {
    if (!focusId) return;
    document.getElementById(`med-${focusId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusId, logs]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.drugName.trim()) return;
    setBusy(true);
    try {
      await api.post("/medications", { employeeId, ...form });
      setForm(EMPTY);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function archive(log: MedLog) {
    const reason = prompt(`Reason for archiving "${log.drugName}" entry (required):`);
    if (!reason || !reason.trim()) return;
    await api.post(`/medications/${log.id}/archive`, { reason });
    await load();
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <form onSubmit={submit} className="bg-white form-panel border rounded-lg p-4 space-y-2 lg:col-span-1">
        <h2 className="font-medium mb-2">Log medication dispensed</h2>
        <input placeholder="Drug name" value={form.drugName} onChange={(e) => setForm({ ...form, drugName: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" required />
        <div className="grid grid-cols-2 gap-2">
          <input placeholder="Strength" value={form.strength} onChange={(e) => setForm({ ...form, strength: e.target.value })} className="border rounded px-2 py-1 text-sm" />
          <input placeholder="Dosage form" value={form.dosageForm} onChange={(e) => setForm({ ...form, dosageForm: e.target.value })} className="border rounded px-2 py-1 text-sm" />
          <input placeholder="Route" value={form.route} onChange={(e) => setForm({ ...form, route: e.target.value })} className="border rounded px-2 py-1 text-sm" />
          <input placeholder="Frequency" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} className="border rounded px-2 py-1 text-sm" />
        </div>
        <input placeholder="Quantity dispensed" value={form.quantityDispensed} onChange={(e) => setForm({ ...form, quantityDispensed: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" />
        <input placeholder="Indication" value={form.indication} onChange={(e) => setForm({ ...form, indication: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" />
        <textarea placeholder="Remarks" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" rows={2} />
        <button disabled={busy} className="w-full bg-clinic-600 text-white rounded py-1.5 text-sm disabled:opacity-50">{busy ? "Saving..." : "Log dispensed"}</button>
      </form>

      <div className="bg-white border rounded-lg lg:col-span-2 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr><th className="p-2">Date</th><th className="p-2">Drug</th><th className="p-2">Dose</th><th className="p-2">Dispensed by</th><th className="p-2"></th></tr>
          </thead>
          <tbody className="divide-y">
            {logs.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-gray-400">No medications logged yet.</td></tr>}
            {logs.map((l) => (
              <tr key={l.id} id={`med-${l.id}`} className={`${l.isArchived ? "opacity-60" : ""} ${focusId === l.id ? "ring-2 ring-inset ring-clinic-400" : ""}`}>
                <td className="p-2">{new Date(l.dispensedAt).toLocaleDateString()}</td>
                <td className="p-2">{l.drugName} {l.isArchived && <span className="text-xs text-red-600">(archived: {l.archiveReason})</span>}</td>
                <td className="p-2">{[l.strength, l.dosageForm, l.route, l.frequency].filter(Boolean).join(" · ") || "—"}</td>
                <td className="p-2">{l.dispensedBy.fullName}</td>
                <td className="p-2 space-x-2 whitespace-nowrap">
                  {!l.isArchived && <button onClick={() => archive(l)} className="text-xs text-red-600 underline">Archive</button>}
                  {user?.role === "ADMIN" && (
                    <PermanentDeleteButton
                      description={`Medication entry "${l.drugName}" dispensed ${new Date(l.dispensedAt).toLocaleString()} by ${l.dispensedBy.fullName}.`}
                      onDelete={async (reason) => { await api.delete(`/medications/${l.id}`, { reason }); await load(); }}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
