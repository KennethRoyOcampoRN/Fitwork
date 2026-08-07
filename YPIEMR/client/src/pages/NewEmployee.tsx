import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import PhotoCaptureModal from "../components/PhotoCaptureModal";
import EmployeeFormFields, { CompanyOption, EMPTY_EMPLOYEE_FORM, EmployeeFormValues } from "../components/EmployeeFormFields";

export default function NewEmployee() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState<EmployeeFormValues>({ ...EMPTY_EMPLOYEE_FORM, employeeCode: searchParams.get("code") || "" });
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    api.get<CompanyOption[]>("/companies").then((list) => {
      setCompanies(list);
      // New employees default to the primary company — an explicit product
      // decision so a fresh hire doesn't start with no company assigned.
      const primary = list.find((c) => c.isPrimary);
      if (primary) setForm((f) => (f.companyId ? f : { ...f, companyId: primary.id }));
    });
  }, []);

  function set<K extends keyof EmployeeFormValues>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onPhotoCaptured(blob: Blob) {
    setPhotoBlob(blob);
    setPhotoPreviewUrl(URL.createObjectURL(blob));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(form)) {
        if (v) payload[k] = v;
      }
      const employee = await api.post<{ id: string }>("/employees", payload);

      if (photoBlob) {
        try {
          const photoForm = new FormData();
          photoForm.append("photo", photoBlob, "photo.jpg");
          await fetch(`/api/employees/${employee.id}/photo`, { method: "POST", credentials: "include", body: photoForm });
        } catch {
          // Employee record was created successfully either way — a failed
          // photo upload shouldn't block navigating to the new profile; the
          // photo can always be added from there instead.
        }
      }

      navigate(`/employees/${employee.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create employee");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-lg font-semibold mb-4">New employee</h1>
      <form onSubmit={submit} className="bg-white form-panel border rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-4 pb-3 border-b">
          <button
            type="button"
            onClick={() => setShowPhotoModal(true)}
            className="w-20 h-20 rounded-lg bg-gray-200 overflow-hidden flex items-center justify-center text-xs text-gray-500 shrink-0"
          >
            {photoPreviewUrl ? <img src={photoPreviewUrl} className="w-full h-full object-cover" /> : "Add photo"}
          </button>
          <div className="text-sm text-gray-500">
            Upload a file or use the webcam. Optional — you can also add this later from the employee's profile.
          </div>
        </div>

        <EmployeeFormFields values={form} onChange={set} companies={companies} />

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={() => navigate(-1)} className="px-4 py-2 text-sm">Cancel</button>
          <button type="submit" disabled={busy} className="bg-clinic-600 text-white rounded px-4 py-2 text-sm disabled:opacity-50">
            {busy ? "Creating..." : "Create employee"}
          </button>
        </div>
      </form>

      {showPhotoModal && (
        <PhotoCaptureModal
          onClose={() => setShowPhotoModal(false)}
          onCapture={onPhotoCaptured}
        />
      )}
    </div>
  );
}
