import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { DIAGNOSIS_FIELD_BY_TYPE, DISPOSITIONS, ILLNESS_CATEGORIES, NOTE_FIELDS_BY_TYPE, NOTE_TYPE_LABEL, ROLE_NOTE_TYPE, VISIT_CATEGORIES } from "../lib/noteTypes";

interface EmployeeSummary {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  knownAllergies: string | null;
}

interface FormState {
  visitCategory: string;
  chiefComplaint: string;
  assessment: string;
  diagnosis: string;
  treatment: string;
  recommendation: string;
  nursingDiagnosis: string;
  plan: string;
  intervention: string;
  evaluation: string;
  illnessCategory: string;
  disposition: string;
  referredTo: string;
  followUpDate: string;
  isWorkRelated: boolean;
}

const EMPTY: FormState = {
  visitCategory: "", chiefComplaint: "", assessment: "",
  diagnosis: "", treatment: "", recommendation: "",
  nursingDiagnosis: "", plan: "", intervention: "", evaluation: "",
  illnessCategory: "",
  disposition: "", referredTo: "", followUpDate: "", isWorkRelated: false,
};

export default function NewNote() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [employee, setEmployee] = useState<EmployeeSummary | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const noteType = user ? ROLE_NOTE_TYPE[user.role] : undefined;
  const isNurse = noteType === "NURSE";
  const storageKey = `fitwork-note-draft-${id}-${noteType}`;
  const fields = noteType ? NOTE_FIELDS_BY_TYPE[noteType] : [];

  useEffect(() => {
    if (!id) return;
    api.get<EmployeeSummary>(`/employees/${id}`).then(setEmployee);
    const draft = localStorage.getItem(storageKey);
    if (draft) {
      try { setForm(JSON.parse(draft)); } catch { /* ignore corrupt draft */ }
    }
  }, [id]);

  useEffect(() => {
    const t = setInterval(() => localStorage.setItem(storageKey, JSON.stringify(form)), 10000);
    return () => clearInterval(t);
  }, [form, storageKey]);

  if (!noteType) {
    return <div className="p-4 text-sm text-red-600">Your role is not permitted to author clinical notes.</div>;
  }

  async function actuallySubmit() {
    setBusy(true);
    setError(null);
    try {
      // Blank optional enum fields (visitCategory, disposition) must be
      // omitted, not sent as "" — the server validates them against a
      // fixed set of values and "" isn't one of them.
      const payload: Record<string, unknown> = { employeeId: id, noteType: noteType!, isWorkRelated: form.isWorkRelated };
      for (const [k, v] of Object.entries(form)) {
        if (k === "isWorkRelated" || k === "followUpDate") continue;
        if (v) payload[k] = v;
      }
      if (form.followUpDate) payload.followUpDate = form.followUpDate;
      const note = await api.post<{ id: string }>("/notes", payload);
      localStorage.removeItem(storageKey);
      navigate(`/employees/${id}?tab=${noteType!.toLowerCase()}`, { replace: true });
      void note;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save note");
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setConfirmOpen(true);
  }

  // Best-effort suggestion only — never overwrites a category the user
  // already picked, and the dropdown stays freely editable afterward.
  const diagnosisField = DIAGNOSIS_FIELD_BY_TYPE[noteType];
  async function suggestCategoryFromDiagnosis() {
    if (form.illnessCategory) return;
    const text = form[diagnosisField];
    if (!text.trim()) return;
    try {
      const res = await api.post<{ category: string | null }>("/notes/suggest-illness-category", { text });
      if (res.category) setForm((f) => (f.illnessCategory ? f : { ...f, illnessCategory: res.category! }));
    } catch {
      // Suggestion is a convenience only — silently ignore failures.
    }
  }

  if (!employee) return <div className="p-4 text-sm text-gray-500">Loading...</div>;

  return (
    <div className="max-w-2xl">
      <div className="bg-white border rounded-xl p-4 mb-4 sticky top-0">
        <div className="text-xs text-gray-400">New {NOTE_TYPE_LABEL[noteType]}</div>
        <div className="font-semibold">{employee.lastName}, {employee.firstName} <span className="text-gray-400 font-normal">#{employee.employeeCode}</span></div>
        {employee.knownAllergies && (
          <div className="mt-2 bg-red-600 text-white text-sm rounded px-3 py-1.5">⚠ Known allergies: {employee.knownAllergies}</div>
        )}
      </div>

      <form onSubmit={onSubmit} className="bg-white border rounded-xl p-4 space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1">Visit category</label>
          <select value={form.visitCategory} onChange={(e) => setForm({ ...form, visitCategory: e.target.value })} className="w-full border rounded px-2 py-1 text-sm">
            <option value="">—</option>
            {VISIT_CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
          </select>
        </div>

        {fields.map((f) => (
          <div key={f.key}>
            <label className="block text-sm font-medium mb-1">{f.label}</label>
            <textarea
              value={form[f.key]}
              onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              onBlur={f.key === diagnosisField ? suggestCategoryFromDiagnosis : undefined}
              className="w-full border rounded px-2 py-1 text-sm"
              rows={2}
            />
          </div>
        ))}

        <div>
          <label className="block text-sm font-medium mb-1">Illness/condition category</label>
          <select value={form.illnessCategory} onChange={(e) => setForm({ ...form, illnessCategory: e.target.value })} className="w-full border rounded px-2 py-1 text-sm">
            <option value="">—</option>
            {ILLNESS_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <p className="text-xs text-gray-400 mt-1">Auto-suggested from the diagnosis above — used for clinic-wide illness reporting, change it if it doesn't fit.</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Disposition</label>
          <select value={form.disposition} onChange={(e) => setForm({ ...form, disposition: e.target.value })} className="w-full border rounded px-2 py-1 text-sm">
            <option value="">—</option>
            {DISPOSITIONS.map((d) => <option key={d} value={d}>{d.replace(/_/g, " ")}</option>)}
          </select>
        </div>
        {!isNurse && (
          <div>
            <label className="block text-sm font-medium mb-1">Referred to</label>
            <input value={form.referredTo} onChange={(e) => setForm({ ...form, referredTo: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" />
          </div>
        )}
        <div>
          <label className="block text-sm font-medium mb-1">Follow-up date</label>
          <input type="date" value={form.followUpDate} onChange={(e) => setForm({ ...form, followUpDate: e.target.value })} className="border rounded px-2 py-1 text-sm" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.isWorkRelated} onChange={(e) => setForm({ ...form, isWorkRelated: e.target.checked })} />
          Work-related
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={() => navigate(-1)} className="px-4 py-2 text-sm">Cancel</button>
          <button type="submit" className="bg-clinic-600 text-white rounded px-4 py-2 text-sm">Save note</button>
        </div>
      </form>

      {confirmOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-4 max-w-sm">
            <h2 className="font-semibold mb-2">Save this note permanently?</h2>
            <p className="text-sm text-gray-600 mb-4">
              This note will be permanently saved and cannot be edited (beyond a short correction window). Continue?
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmOpen(false)} className="px-4 py-2 text-sm">Cancel</button>
              <button onClick={actuallySubmit} disabled={busy} className="bg-clinic-600 text-white rounded px-4 py-2 text-sm disabled:opacity-50">
                {busy ? "Saving..." : "Save permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
