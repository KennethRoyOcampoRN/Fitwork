import React, { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import PermanentDeleteButton from "./PermanentDeleteButton";

interface DrugTest {
  id: string;
  testDate: string;
  result: string;
  specimenType: string | null;
  labName: string | null;
  remarks: string | null;
  sourceType: string;
}

const RESULTS = ["NEGATIVE", "POSITIVE", "PENDING"];

const EMPTY_FORM = {
  testDate: new Date().toISOString().slice(0, 10),
  result: "", specimenType: "", labName: "", remarks: "",
};

export default function DrugTestTab({ employeeId, focusId }: { employeeId: string; focusId?: string | null }) {
  const { user } = useAuth();
  const [tests, setTests] = useState<DrugTest[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setTests(await api.get<DrugTest[]>(`/drug-tests?employeeId=${employeeId}`));
  }
  useEffect(() => { load(); }, [employeeId]);

  useEffect(() => {
    if (!focusId) return;
    setExpanded(focusId);
    document.getElementById(`drugtest-${focusId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusId, tests]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { employeeId, testDate: form.testDate, result: form.result };
      if (form.specimenType) payload.specimenType = form.specimenType;
      if (form.labName) payload.labName = form.labName;
      if (form.remarks) payload.remarks = form.remarks;
      await api.post("/drug-tests", payload);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save drug test result");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h2 className="font-medium">Drug Test Results</h2>
        <button onClick={() => setShowForm((s) => !s)} className="bg-clinic-600 text-white rounded px-3 py-1.5 text-sm">
          {showForm ? "Cancel" : "+ New drug test result"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="bg-white form-panel border rounded-lg p-4 mb-4 grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
          <input placeholder="Test date" type="date" value={form.testDate} onChange={(e) => setForm({ ...form, testDate: e.target.value })} className="border rounded px-2 py-1" required />
          <select value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value })} className="border rounded px-2 py-1" required>
            <option value="">Result</option>
            {RESULTS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <input placeholder="Specimen type" value={form.specimenType} onChange={(e) => setForm({ ...form, specimenType: e.target.value })} className="border rounded px-2 py-1" />
          <input placeholder="Lab name" value={form.labName} onChange={(e) => setForm({ ...form, labName: e.target.value })} className="border rounded px-2 py-1" />
          <textarea placeholder="Remarks" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} className="border rounded px-2 py-1 col-span-full" rows={2} />
          {error && <p className="text-red-600 text-xs col-span-full">{error}</p>}
          <button disabled={busy} className="bg-clinic-600 text-white rounded px-4 py-1.5 col-span-full">{busy ? "Saving..." : "Save drug test result"}</button>
        </form>
      )}

      <div className="space-y-2">
        {tests.length === 0 && <p className="text-sm text-gray-400">No drug test results yet.</p>}
        {tests.map((t) => (
          <div key={t.id} id={`drugtest-${t.id}`} className={`bg-white border rounded-lg p-3 ${focusId === t.id ? "ring-2 ring-clinic-400" : ""}`}>
            <div className="w-full flex justify-between items-center gap-2">
              <button onClick={() => setExpanded(expanded === t.id ? null : t.id)} className="flex-1 flex justify-between items-center text-left">
                <span className="font-medium">{new Date(t.testDate).toLocaleDateString()}</span>
                <span className="text-xs text-gray-500">
                  <span className={`rounded px-2 py-0.5 mr-2 ${t.result === "POSITIVE" ? "bg-red-100 text-red-800" : t.result === "PENDING" ? "bg-amber-100 text-amber-800" : "bg-gray-100"}`}>{t.result}</span>
                  {expanded === t.id ? "Hide" : "Details"}
                </span>
              </button>
              {user?.role === "ADMIN" && (
                <PermanentDeleteButton
                  description={`Drug test result dated ${new Date(t.testDate).toLocaleDateString()} (${t.result}).`}
                  onDelete={async (reason) => { await api.delete(`/drug-tests/${t.id}`, { reason }); await load(); }}
                />
              )}
            </div>
            {expanded === t.id && (
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm text-gray-700 border-t pt-2">
                <div>Specimen type: {t.specimenType || "—"}</div>
                <div>Lab: {t.labName || "—"}</div>
                <div>Source: {t.sourceType === "IMPORT" ? "Imported" : "Manual entry"}</div>
                {t.remarks && <div className="col-span-full">Remarks: {t.remarks}</div>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
