import React, { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import PermanentDeleteButton from "./PermanentDeleteButton";

interface LabTest {
  id: string;
  testType: string;
  datePerformed: string;
  findings: string | null;
  resultStatus: string;
  sourceType: string;
  orderedBy: { fullName: string };
}

interface TestTypeOption {
  id: string;
  name: string;
  isActive: boolean;
}

const RESULT_STATUSES = ["NORMAL", "ABNORMAL", "PENDING"];

const EMPTY_FORM = {
  testType: "",
  datePerformed: new Date().toISOString().slice(0, 10),
  findings: "",
  resultStatus: "",
};

export default function LabTestTab({ employeeId, focusId }: { employeeId: string; focusId?: string | null }) {
  const { user } = useAuth();
  const [tests, setTests] = useState<LabTest[]>([]);
  const [testTypes, setTestTypes] = useState<TestTypeOption[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setTests(await api.get<LabTest[]>(`/lab-tests?employeeId=${employeeId}`));
  }
  useEffect(() => { load(); }, [employeeId]);
  useEffect(() => { api.get<TestTypeOption[]>("/test-types").then(setTestTypes); }, []);

  useEffect(() => {
    if (!focusId) return;
    setExpanded(focusId);
    document.getElementById(`labtest-${focusId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusId, tests]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        employeeId, testType: form.testType, datePerformed: form.datePerformed, resultStatus: form.resultStatus,
      };
      if (form.findings) payload.findings = form.findings;
      await api.post("/lab-tests", payload);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save lab test result");
    } finally {
      setBusy(false);
    }
  }

  const activeTestTypes = testTypes.filter((t) => t.isActive);

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h2 className="font-medium">Lab / Diagnostic Tests</h2>
        <button onClick={() => setShowForm((s) => !s)} className="bg-clinic-600 text-white rounded px-3 py-1.5 text-sm">
          {showForm ? "Cancel" : "+ New lab/diagnostic test"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="bg-white border rounded-xl p-4 mb-4 grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
          <select value={form.testType} onChange={(e) => setForm({ ...form, testType: e.target.value })} className="border rounded px-2 py-1" required>
            <option value="">Test type</option>
            {activeTestTypes.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
          </select>
          <input placeholder="Date performed" type="date" value={form.datePerformed} onChange={(e) => setForm({ ...form, datePerformed: e.target.value })} className="border rounded px-2 py-1" required />
          <select value={form.resultStatus} onChange={(e) => setForm({ ...form, resultStatus: e.target.value })} className="border rounded px-2 py-1" required>
            <option value="">Result status</option>
            {RESULT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <textarea placeholder="Result / findings" value={form.findings} onChange={(e) => setForm({ ...form, findings: e.target.value })} className="border rounded px-2 py-1 col-span-full" rows={2} />
          <p className="text-xs text-gray-400 col-span-full">Ordered by: {user?.fullName} (auto-filled from your account)</p>
          {activeTestTypes.length === 0 && (
            <p className="text-xs text-amber-700 col-span-full">No test types configured yet — an admin can add some under Admin &gt; Test Types.</p>
          )}
          {error && <p className="text-red-600 text-xs col-span-full">{error}</p>}
          <button disabled={busy} className="bg-clinic-600 text-white rounded px-4 py-1.5 col-span-full">{busy ? "Saving..." : "Save lab test result"}</button>
        </form>
      )}

      <div className="space-y-2">
        {tests.length === 0 && <p className="text-sm text-gray-400">No lab/diagnostic tests recorded yet.</p>}
        {tests.map((t) => (
          <div key={t.id} id={`labtest-${t.id}`} className={`bg-white border rounded-xl p-3 ${focusId === t.id ? "ring-2 ring-clinic-400" : ""}`}>
            <div className="w-full flex justify-between items-center gap-2">
              <button onClick={() => setExpanded(expanded === t.id ? null : t.id)} className="flex-1 flex justify-between items-center text-left">
                <span className="font-medium">{t.testType} — {new Date(t.datePerformed).toLocaleDateString()}</span>
                <span className="text-xs text-gray-500">
                  <span className={`rounded px-2 py-0.5 mr-2 ${t.resultStatus === "ABNORMAL" ? "bg-red-100 text-red-800" : t.resultStatus === "PENDING" ? "bg-amber-100 text-amber-800" : "bg-gray-100"}`}>{t.resultStatus}</span>
                  {expanded === t.id ? "Hide" : "Details"}
                </span>
              </button>
              {user?.role === "ADMIN" && (
                <PermanentDeleteButton
                  description={`${t.testType} lab test dated ${new Date(t.datePerformed).toLocaleDateString()} (${t.resultStatus}).`}
                  onDelete={async (reason) => { await api.delete(`/lab-tests/${t.id}`, { reason }); await load(); }}
                />
              )}
            </div>
            {expanded === t.id && (
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm text-gray-700 border-t pt-2">
                <div>Ordered by: {t.orderedBy.fullName}</div>
                <div>Source: {t.sourceType === "IMPORT" ? "Imported" : "Manual entry"}</div>
                {t.findings && <div className="col-span-full">Findings: {t.findings}</div>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
