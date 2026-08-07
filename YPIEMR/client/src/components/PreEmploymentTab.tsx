import React, { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import PermanentDeleteButton from "./PermanentDeleteButton";

interface PreEmployment {
  id: string;
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
  pregnancyTestResult: string | null;
  medicalHistory: string | null;
  physicalExamFindings: string | null;
  otherFindings: string | null;
  significantFindings: string | null;
  recommendations: string | null;
  fitnessClassification: string | null;
  sourceType: string;
  createdAt: string;
}

const FITNESS_CLASSES = ["CLASS_A", "CLASS_B", "CLASS_C", "CLASS_D", "PENDING"];

const EMPTY_FORM = {
  examDate: "", provider: "", heightCm: "", weightKg: "", bloodPressure: "",
  visionOD: "", visionOS: "", hearing: "", cbcResult: "", urinalysisResult: "",
  fecalysisResult: "", chestXrayResult: "", ecgResult: "", drugTestResult: "",
  pregnancyTestResult: "", medicalHistory: "", physicalExamFindings: "",
  otherFindings: "", significantFindings: "", recommendations: "", fitnessClassification: "",
};

export default function PreEmploymentTab({ employeeId, focusId }: { employeeId: string; focusId?: string | null }) {
  const { user } = useAuth();
  const [exams, setExams] = useState<PreEmployment[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setExams(await api.get<PreEmployment[]>(`/pre-employment?employeeId=${employeeId}`));
  }
  useEffect(() => { load(); }, [employeeId]);

  useEffect(() => {
    if (!focusId) return;
    setExpanded(focusId);
    document.getElementById(`preemployment-${focusId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusId, exams]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { employeeId };
      for (const [k, v] of Object.entries(form)) {
        if (!v) continue;
        if (k === "heightCm" || k === "weightKg") payload[k] = Number(v);
        else payload[k] = v;
      }
      await api.post("/pre-employment", payload);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save pre-employment exam");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h2 className="font-medium">Pre-Employment Exams</h2>
        <button onClick={() => setShowForm((s) => !s)} className="bg-clinic-600 text-white rounded px-3 py-1.5 text-sm">
          {showForm ? "Cancel" : "+ New pre-employment exam"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="bg-white border rounded-xl p-4 mb-4 grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
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
          <input placeholder="Pregnancy test" value={form.pregnancyTestResult} onChange={(e) => setForm({ ...form, pregnancyTestResult: e.target.value })} className="border rounded px-2 py-1" />
          <select value={form.fitnessClassification} onChange={(e) => setForm({ ...form, fitnessClassification: e.target.value })} className="border rounded px-2 py-1">
            <option value="">Fitness classification</option>
            {FITNESS_CLASSES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
          </select>
          <textarea placeholder="Medical history" value={form.medicalHistory} onChange={(e) => setForm({ ...form, medicalHistory: e.target.value })} className="border rounded px-2 py-1 col-span-full" rows={2} />
          <textarea placeholder="Physical exam findings" value={form.physicalExamFindings} onChange={(e) => setForm({ ...form, physicalExamFindings: e.target.value })} className="border rounded px-2 py-1 col-span-full" rows={2} />
          <textarea placeholder="Other findings" value={form.otherFindings} onChange={(e) => setForm({ ...form, otherFindings: e.target.value })} className="border rounded px-2 py-1 col-span-full" rows={2} />
          <textarea placeholder="Significant findings" value={form.significantFindings} onChange={(e) => setForm({ ...form, significantFindings: e.target.value })} className="border rounded px-2 py-1 col-span-full" rows={2} />
          <textarea placeholder="Recommendations" value={form.recommendations} onChange={(e) => setForm({ ...form, recommendations: e.target.value })} className="border rounded px-2 py-1 col-span-full" rows={2} />
          {error && <p className="text-red-600 text-xs col-span-full">{error}</p>}
          <button disabled={busy} className="bg-clinic-600 text-white rounded px-4 py-1.5 col-span-full">{busy ? "Saving..." : "Save pre-employment exam"}</button>
        </form>
      )}

      <div className="space-y-2">
        {exams.length === 0 && <p className="text-sm text-gray-400">No pre-employment exams yet.</p>}
        {exams.map((p) => (
          <div key={p.id} id={`preemployment-${p.id}`} className={`bg-white border rounded-xl p-3 ${focusId === p.id ? "ring-2 ring-clinic-400" : ""}`}>
            <div className="w-full flex justify-between items-center gap-2">
              <button onClick={() => setExpanded(expanded === p.id ? null : p.id)} className="flex-1 flex justify-between items-center text-left">
                <span className="font-medium">{p.examDate ? new Date(p.examDate).toLocaleDateString() : new Date(p.createdAt).toLocaleDateString()}</span>
                <span className="text-xs text-gray-500">
                  {p.fitnessClassification && <span className="bg-gray-100 rounded px-2 py-0.5 mr-2">{p.fitnessClassification.replace(/_/g, " ")}</span>}
                  {expanded === p.id ? "Hide" : "Details"}
                </span>
              </button>
              {user?.role === "ADMIN" && (
                <PermanentDeleteButton
                  description={`Pre-employment exam${p.examDate ? ` dated ${new Date(p.examDate).toLocaleDateString()}` : ""} for this employee.`}
                  onDelete={async (reason) => { await api.delete(`/pre-employment/${p.id}`, { reason }); await load(); }}
                />
              )}
            </div>
            {expanded === p.id && (
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm text-gray-700 border-t pt-2">
                <div>Provider: {p.provider || "—"}</div>
                <div>Ht/Wt: {p.heightCm ?? "—"}cm / {p.weightKg ?? "—"}kg</div>
                <div>BMI: {p.bmi ?? "—"}</div>
                <div>BP: {p.bloodPressure || "—"}</div>
                <div>Vision OD/OS: {p.visionOD || "—"} / {p.visionOS || "—"}</div>
                <div>Hearing: {p.hearing || "—"}</div>
                <div>CBC: {p.cbcResult || "—"}</div>
                <div>Urinalysis: {p.urinalysisResult || "—"}</div>
                <div>Fecalysis: {p.fecalysisResult || "—"}</div>
                <div>Chest X-ray: {p.chestXrayResult || "—"}</div>
                <div>ECG: {p.ecgResult || "—"}</div>
                <div>Drug test: {p.drugTestResult || "—"}</div>
                <div>Pregnancy test: {p.pregnancyTestResult || "—"}</div>
                <div>Source: {p.sourceType === "IMPORT" ? "Imported" : "Manual entry"}</div>
                {p.medicalHistory && <div className="col-span-full">Medical history: {p.medicalHistory}</div>}
                {p.physicalExamFindings && <div className="col-span-full">Physical exam: {p.physicalExamFindings}</div>}
                {p.otherFindings && <div className="col-span-full">Other findings: {p.otherFindings}</div>}
                {p.significantFindings && <div className="col-span-full">Significant findings: {p.significantFindings}</div>}
                {p.recommendations && <div className="col-span-full">Recommendations: {p.recommendations}</div>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
