import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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

// Mirrors server/src/services/apeLabFields.ts's APE_LAB_FIELD_TO_TEST_TYPE —
// same hand-synced-small-list convention as ILLNESS_CATEGORIES elsewhere in
// the app. Used only to warn a nurse who's about to record a test type an
// employee's current-year APE already has a result for (see below); the
// report-layer join that counts these together lives server-side.
const APE_LAB_FIELD_TO_TEST_TYPE: Record<string, string> = {
  cbcResult: "CBC",
  urinalysisResult: "Urinalysis",
  fecalysisResult: "Fecalysis",
  chestXrayResult: "Chest X-ray",
  ecgResult: "ECG",
  drugTestResult: "Drug Test",
  hepatitisScreeningResult: "Hepatitis Screening",
  hepaProfileResult: "Hepatitis Profile",
};
const TEST_TYPE_TO_APE_FIELD: Record<string, string> = Object.fromEntries(
  Object.entries(APE_LAB_FIELD_TO_TEST_TYPE).map(([field, label]) => [label, field])
);

interface ApeSummary {
  id: string;
  examYear: number;
  cbcResult: string | null;
  urinalysisResult: string | null;
  fecalysisResult: string | null;
  chestXrayResult: string | null;
  ecgResult: string | null;
  drugTestResult: string | null;
  hepatitisScreeningResult: string | null;
  hepaProfileResult: string | null;
}

interface LabDocSummary {
  id: string;
  title: string;
  documentDate: string | null;
  createdAt: string;
}

// Same "check before you duplicate" idea as the APE cross-link above, but
// against uploaded LABORATORY-category documents instead of APE fields —
// a nurse recording a structured Lab Test result may not realize the same
// lab event was already uploaded as a PDF/scan under Labs & Documents.
// Window is +/- 3 days since a "same event" upload/result pair rarely lands
// on the exact same calendar day (scan uploaded a day or two after the visit).
const DUPLICATE_WINDOW_DAYS = 3;
function daysApart(a: string, b: string) {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000;
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
  const navigate = useNavigate();
  const [tests, setTests] = useState<LabTest[]>([]);
  const [testTypes, setTestTypes] = useState<TestTypeOption[]>([]);
  const [apes, setApes] = useState<ApeSummary[]>([]);
  const [labDocs, setLabDocs] = useState<LabDocSummary[]>([]);
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
  useEffect(() => { api.get<ApeSummary[]>(`/ape?employeeId=${employeeId}`).then(setApes); }, [employeeId]);
  useEffect(() => { api.get<LabDocSummary[]>(`/documents?employeeId=${employeeId}&category=LABORATORY`).then(setLabDocs); }, [employeeId]);

  // Duplicate-entry heads-up: if the employee's current-year APE already has
  // a non-null result for the field matching the selected test type, warn
  // before saving — not blocking, since a repeat test can be legitimate,
  // just a check-before-you-duplicate prompt.
  const currentYearApe = apes.find((a) => a.examYear === new Date().getFullYear());
  const apeField = TEST_TYPE_TO_APE_FIELD[form.testType];
  const duplicateWarning = currentYearApe && apeField && (currentYearApe as unknown as Record<string, string | null>)[apeField]
    ? currentYearApe
    : null;

  // Same idea, against uploaded LABORATORY documents whose date falls near
  // the date being entered here.
  const duplicateDoc = form.datePerformed
    ? labDocs.find((d) => daysApart(d.documentDate || d.createdAt, form.datePerformed) <= DUPLICATE_WINDOW_DAYS)
    : undefined;

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
          {duplicateWarning && (
            <div className="col-span-full bg-amber-50 border border-amber-200 rounded px-3 py-2 text-xs text-amber-800 flex items-center justify-between gap-2">
              <span>Heads up: this employee's {duplicateWarning.examYear} APE already has a {form.testType} result — check before adding a duplicate.</span>
              <button
                type="button"
                onClick={() => navigate(`/employees/${employeeId}?tab=ape&focus=${duplicateWarning.id}`)}
                className="underline shrink-0"
              >
                View APE record
              </button>
            </div>
          )}
          {duplicateDoc && (
            <div className="col-span-full bg-amber-50 border border-amber-200 rounded px-3 py-2 text-xs text-amber-800 flex items-center justify-between gap-2">
              <span>Heads up: a Laboratory document "{duplicateDoc.title}" is already on file dated close to this test — check before adding a duplicate.</span>
              <button
                type="button"
                onClick={() => navigate(`/employees/${employeeId}?tab=documents&focus=${duplicateDoc.id}`)}
                className="underline shrink-0"
              >
                View document
              </button>
            </div>
          )}
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
