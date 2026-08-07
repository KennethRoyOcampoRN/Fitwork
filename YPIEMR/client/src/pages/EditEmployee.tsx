import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import PhotoCaptureModal from "../components/PhotoCaptureModal";
import EmployeeFormFields, { CompanyOption, EMPTY_EMPLOYEE_FORM, EmployeeFormValues } from "../components/EmployeeFormFields";

interface EmployeeRecord extends Record<string, unknown> {
  id: string;
  photoPath: string | null;
  companyId: string | null;
}

function toDateInputValue(value: unknown): string {
  if (!value || typeof value !== "string") return "";
  return value.slice(0, 10); // ISO string -> yyyy-MM-dd
}

export default function EditEmployee() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState<EmployeeFormValues | null>(null);
  const [employee, setEmployee] = useState<EmployeeRecord | null>(null);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [photoVersion, setPhotoVersion] = useState(0);

  useEffect(() => { api.get<CompanyOption[]>("/companies").then(setCompanies); }, []);

  useEffect(() => {
    if (!id) return;
    api.get<EmployeeRecord>(`/employees/${id}`).then((emp) => {
      setEmployee(emp);
      const next: EmployeeFormValues = { ...EMPTY_EMPLOYEE_FORM };
      for (const key of Object.keys(EMPTY_EMPLOYEE_FORM) as (keyof EmployeeFormValues)[]) {
        if (key === "companyId") continue; // seeded separately below
        const raw = emp[key];
        if (key === "dateOfBirth" || key === "dateHired") next[key] = toDateInputValue(raw);
        else if (typeof raw === "string") next[key] = raw;
      }
      next.companyId = emp.companyId || "";
      setForm(next);
      setLoading(false);
    });
  }, [id]);

  function set<K extends keyof EmployeeFormValues>(key: K, value: string) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form || !id) return;
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(form)) {
        if (k === "employeeCode") continue; // locked — never sent
        payload[k] = v || null;
      }
      await api.patch(`/employees/${id}`, payload);
      navigate(`/employees/${id}`, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save changes");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !form || !employee) return <div className="p-4 text-sm text-gray-500">Loading...</div>;

  return (
    <div className="max-w-2xl">
      <h1 className="text-lg font-semibold mb-4">Edit employee — {form.lastName}, {form.firstName}</h1>
      <form onSubmit={submit} className="bg-white border rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-4 pb-3 border-b">
          <button
            type="button"
            onClick={() => setShowPhotoModal(true)}
            className="w-20 h-20 rounded-lg bg-gray-200 overflow-hidden flex items-center justify-center text-xs text-gray-500 shrink-0"
          >
            {employee.photoPath ? <img key={photoVersion} src={`/api/employees/${id}/photo/full?v=${photoVersion}`} className="w-full h-full object-cover" /> : "Add photo"}
          </button>
          <div className="text-sm text-gray-500">Upload a file or use the webcam to replace the current photo.</div>
        </div>

        <EmployeeFormFields values={form} onChange={set} employeeCodeLocked companies={companies} />

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={() => navigate(`/employees/${id}`)} className="px-4 py-2 text-sm">Cancel</button>
          <button type="submit" disabled={busy} className="bg-clinic-600 text-white rounded px-4 py-2 text-sm disabled:opacity-50">
            {busy ? "Saving..." : "Save changes"}
          </button>
        </div>
      </form>

      {showPhotoModal && id && (
        <PhotoCaptureModal
          employeeId={id}
          onClose={() => setShowPhotoModal(false)}
          onSaved={() => setPhotoVersion((v) => v + 1)}
        />
      )}
    </div>
  );
}
