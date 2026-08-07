import React, { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import PermanentDeleteButton from "./PermanentDeleteButton";

interface Ape {
  id: string;
  examYear: number;
  examDate: string | null;
  provider: string | null;
  heightCm: number | null;
  weightKg: number | null;
  bmi: number | null;
  bloodPressure: string | null;
  visionOD: string | null;
  visionOS: string | null;
  hearing: string | null;
  cbcResult: string | null;
  urinalysisResult: string | null;
  fecalysisResult: string | null;
  chestXrayResult: string | null;
  ecgResult: string | null;
  drugTestResult: string | null;
  hepatitisScreeningResult: string | null;
  hepaProfileResult: string | null;
  physicalExamFindings: string | null;
  otherFindings: string | null;
  significantFindings: string | null;
  recommendations: string | null;
  fitnessClassification: string | null;
  sourceType: string;
}

const FITNESS_CLASSES = ["CLASS_A", "CLASS_B", "CLASS_C", "CLASS_D", "PENDING"];

const EMPTY_FORM = {
  examYear: new Date().getFullYear().toString(),
  examDate: "", provider: "", heightCm: "", weightKg: "", bloodPressure: "",
  visionOD: "", visionOS: "", hearing: "", cbcResult: "", urinalysisResult: "",
  fecalysisResult: "", chestXrayResult: "", ecgResult: "", drugTestResult: "",
  hepatitisScreeningResult: "", hepaProfileResult: "", physicalExamFindings: "",
  otherFindings: "", significantFindings: "", recommendations: "", fitnessClassification: "",
};

export default function ApeTab({ employeeId, focusId }: { employeeId: string; focusId?: string | null }) {
  const { user } = useAuth();
  const [apes, setApes] = useState<Ape[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setApes(await api.get<Ape[]>(`/ape?employeeId=${employeeId}`));
  }
  useEffect(() => { load(); }, [employeeId]);

  useEffect(() => {
    if (!focusId) return;
    setExpanded(focusId);
    document.getElementById(`ape-${focusId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusId, apes]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { employeeId, examYear: Number(form.examYear) };
      for (const [k, v] of Object.entries(form)) {
        if (k === "examYear" || !v) continue;
        if (k === "heightCm" || k === "weightKg") payload[k] = Number(v);
        else payload[k] = v;
      }
      await api.post("/ape", payload);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save APE record");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h2 className="font-medium">Annual Physical Exams</h2>
        <button onClick={() => setShowForm((s) => !s)} className="bg-clinic-600 text-white rounded px-3 py-1.5 text-sm">
          {showForm ? "Cancel" : "+ New APE record"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="bg-white form-panel border rounded-lg p-4 mb-4 grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
          <input placeholder="Exam year" type="number" value={form.examYear} onChange={(e) => setForm({ ...form, examYear: e.target.value })} className="border rounded px-2 py-1" required />
          <input placeholder="Exam date" type="date" value={form.examDate} onChange={(e) => setForm({ ...form, examDate: e.target.value })} className="border rounded px-2 py-1" />
          <input placeholder="Provider" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} className="border rounded px-2 py-1" />
          <input placeholder="Height (cm)" type="number" value={form.heightCm} onChange={(e) => setForm({ ...form, heightCm: e.target.value })} className="border rounded px-2 py-1" />
          <input placeholder="Weight (kg)" type="number" value={form.weightKg} onChange={(e) => setForm({ ...form, weightKg: e.target.value })} className="border rounded px-2 py-1" />
          <input placeholder="Blood pressure" value={form.bloodPressure} onChange={(e) => setForm({ ...form, bloodPressure: e.target.value })} className="border rounded px-2 py-1" />
          <input placeholder="Vision OD" value={form.visionOD} onChange={(e) => setForm({ ...form, visionOD: e.target.value })} className="border rounded px-2 py-1" />
          <input placeholder="Vision OS" value={form.visionOS} onChange={(e) => setForm({ ...form, visionOS: e.target.value })} className="border rounded px-2 py-1" />
          <input placeholder="Hearing" value={form.hearing} onChange={(e) => setForm({ ...form, hearing: e.target.value })} className="border rounded px-2 py-1" />
          <input placeholder="CBC result" value={form.cbcResult} onChange={(e) => setForm({ ...form, cbcResult: e.target.value })} className="border rounded px-2 py-1" />
          <input placeholder="Urinalysis result" value={form.urinalysisResult} onChange={(e) => setForm({ ...form, urinalysisResult: e.target.value })} className="border rounded px-2 py-1" />
          <input placeholder="Fecalysis result" value={form.fecalysisResult} onChange={(e) => setForm({ ...form, fecalysisResult: e.target.value })} className="border rounded px-2 py-1" />
          <input placeholder="Chest X-ray result" value={form.chestXrayResult} onChange={(e) => setForm({ ...form, chestXrayResult: e.target.value })} className="border rounded px-2 py-1" />
          <input placeholder="ECG result" value={form.ecgResult} onChange={(e) => setForm({ ...form, ecgResult: e.target.value })} className="border rounded px-2 py-1" />
          <input placeholder="Drug test result" value={form.drugTestResult} onChange={(e) => setForm({ ...form, drugTestResult: e.target.value })} className="border rounded px-2 py-1" />
          <input placeholder="Hepatitis screening" value={form.hepatitisScreeningResult} onChange={(e) => setForm({ ...form, hepatitisScreeningResult: e.target.value })} className="border rounded px-2 py-1" />
          <input placeholder="Hepa profile" value={form.hepaProfileResult} onChange={(e) => setForm({ ...form, hepaProfileResult: e.target.value })} className="border rounded px-2 py-1" />
          <select value={form.fitnessClassification} onChange={(e) => setForm({ ...form, fitnessClassification: e.target.value })} className="border rounded px-2 py-1">
            <option value="">Fitness classification</option>
            {FITNESS_CLASSES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
          </select>
          <textarea placeholder="Physical exam findings" value={form.physicalExamFindings} onChange={(e) => setForm({ ...form, physicalExamFindings: e.target.value })} className="border rounded px-2 py-1 col-span-full" rows={2} />
          <textarea placeholder="Other findings" value={form.otherFindings} onChange={(e) => setForm({ ...form, otherFindings: e.target.value })} className="border rounded px-2 py-1 col-span-full" rows={2} />
          <textarea placeholder="Significant findings" value={form.significantFindings} onChange={(e) => setForm({ ...form, significantFindings: e.target.value })} className="border rounded px-2 py-1 col-span-full" rows={2} />
          <textarea placeholder="Recommendations" value={form.recommendations} onChange={(e) => setForm({ ...form, recommendations: e.target.value })} className="border rounded px-2 py-1 col-span-full" rows={2} />
          {error && <p className="text-red-600 text-xs col-span-full">{error}</p>}
          <button disabled={busy} className="bg-clinic-600 text-white rounded px-4 py-1.5 col-span-full">{busy ? "Saving..." : "Save APE record"}</button>
        </form>
      )}

      <div className="space-y-2">
        {apes.length === 0 && <p className="text-sm text-gray-400">No APE records yet.</p>}
        {apes.map((a) => (
          <div key={a.id} id={`ape-${a.id}`} className={`bg-white border rounded-lg p-3 ${focusId === a.id ? "ring-2 ring-clinic-400" : ""}`}>
            <div className="w-full flex justify-between items-center gap-2">
              <button onClick={() => setExpanded(expanded === a.id ? null : a.id)} className="flex-1 flex justify-between items-center text-left">
                <span className="font-medium">{a.examYear}{a.examDate ? ` — ${new Date(a.examDate).toLocaleDateString()}` : ""}</span>
                <span className="text-xs text-gray-500">
                  {a.fitnessClassification && <span className="bg-gray-100 rounded px-2 py-0.5 mr-2">{a.fitnessClassification.replace(/_/g, " ")}</span>}
                  {expanded === a.id ? "Hide" : "Details"}
                </span>
              </button>
              {user?.role === "ADMIN" && (
                <PermanentDeleteButton
                  description={`Annual Physical Exam record for ${a.examYear}${a.examDate ? ` (${new Date(a.examDate).toLocaleDateString()})` : ""}.`}
                  onDelete={async (reason) => { await api.delete(`/ape/${a.id}`, { reason }); await load(); }}
                />
              )}
            </div>
            {expanded === a.id && (
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm text-gray-700 border-t pt-2">
                <div>Provider: {a.provider || "—"}</div>
                <div>Ht/Wt: {a.heightCm ?? "—"}cm / {a.weightKg ?? "—"}kg</div>
                <div>BMI: {a.bmi ?? "—"}</div>
                <div>BP: {a.bloodPressure || "—"}</div>
                <div>Vision OD/OS: {a.visionOD || "—"} / {a.visionOS || "—"}</div>
                <div>Hearing: {a.hearing || "—"}</div>
                <div>CBC: {a.cbcResult || "—"}</div>
                <div>Urinalysis: {a.urinalysisResult || "—"}</div>
                <div>Fecalysis: {a.fecalysisResult || "—"}</div>
                <div>Chest X-ray: {a.chestXrayResult || "—"}</div>
                <div>ECG: {a.ecgResult || "—"}</div>
                <div>Drug test: {a.drugTestResult || "—"}</div>
                <div>Hepatitis screening: {a.hepatitisScreeningResult || "—"}</div>
                <div>Hepa profile: {a.hepaProfileResult || "—"}</div>
                {a.physicalExamFindings && <div className="col-span-full">Physical exam: {a.physicalExamFindings}</div>}
                {a.otherFindings && <div className="col-span-full">Other findings: {a.otherFindings}</div>}
                {a.significantFindings && <div className="col-span-full">Significant findings: {a.significantFindings}</div>}
                {a.recommendations && <div className="col-span-full">Recommendations: {a.recommendations}</div>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
