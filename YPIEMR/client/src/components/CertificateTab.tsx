import React, { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { downloadFile } from "../lib/download";

interface Certificate {
  id: string;
  controlNumber: string;
  examDate: string;
  issuedAt: string;
  complaints: string;
  diagnosis: string;
  remarks: string;
  doctor: { fullName: string };
}

function emptyForm(name: string, address: string) {
  return {
    name, address,
    examDate: new Date().toISOString().slice(0, 10),
    complaints: "", diagnosis: "", remarks: "",
  };
}

// Only Doctor/Dentist roles can issue a certificate — this is a UX guard
// only; the server re-enforces the same restriction with a real 403, per
// the feature's access-control requirement.
const ISSUER_ROLES = new Set(["DOCTOR", "DENTIST"]);

export default function CertificateTab({
  employeeId, employeeName, employeeAddress, focusId,
}: { employeeId: string; employeeName: string; employeeAddress: string; focusId?: string | null }) {
  const { user } = useAuth();
  const canIssue = !!user && ISSUER_ROLES.has(user.role);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm(employeeName, employeeAddress));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastControlNumber, setLastControlNumber] = useState<string | null>(null);

  async function load() {
    setCertificates(await api.get<Certificate[]>(`/certificates/employee/${employeeId}`));
  }
  useEffect(() => { load(); }, [employeeId]);

  useEffect(() => {
    if (!focusId) return;
    setExpanded(focusId);
    document.getElementById(`certificate-${focusId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusId, certificates]);

  useEffect(() => { setForm(emptyForm(employeeName, employeeAddress)); }, [employeeName, employeeAddress]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setLastControlNumber(null);
    try {
      const res = await fetch("/api/certificates/employee", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, ...form }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new ApiError(res.status, data.error || "Could not generate certificate");
      }
      const controlNumber = res.headers.get("X-Control-Number");
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `medical-certificate-${controlNumber || "certificate"}.pdf`;
      a.click();
      URL.revokeObjectURL(objectUrl);

      setLastControlNumber(controlNumber);
      setForm(emptyForm(employeeName, employeeAddress));
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not generate certificate");
    } finally {
      setBusy(false);
    }
  }

  async function redownload(cert: Certificate) {
    await downloadFile(`/api/certificates/${cert.id}/file`, `medical-certificate-${cert.controlNumber}.pdf`);
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h2 className="font-medium">Medical Certificates</h2>
        {canIssue && (
          <button onClick={() => setShowForm((s) => !s)} className="bg-clinic-600 text-white rounded px-3 py-1.5 text-sm">
            {showForm ? "Cancel" : "+ New certificate"}
          </button>
        )}
      </div>

      {showForm && canIssue && (
        <form onSubmit={submit} className="bg-white form-panel border rounded-lg p-4 mb-4 space-y-2 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input placeholder="Patient name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border rounded px-2 py-1" required />
            <input placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="border rounded px-2 py-1" required />
          </div>
          <label className="block text-xs text-gray-500">Examined/treated on</label>
          <input type="date" value={form.examDate} onChange={(e) => setForm({ ...form, examDate: e.target.value })} className="border rounded px-2 py-1" required />
          <label className="block text-xs font-semibold text-gray-600 pt-1">P.E. FINDINGS / COMPLAINTS</label>
          <textarea placeholder="Complaints / P.E. Findings" value={form.complaints} onChange={(e) => setForm({ ...form, complaints: e.target.value })} className="border rounded px-2 py-1 w-full" rows={2} required />
          <label className="block text-xs font-semibold text-gray-600 pt-1">DIAGNOSIS</label>
          <textarea placeholder="Diagnosis" value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} className="border rounded px-2 py-1 w-full" rows={2} required />
          <label className="block text-xs font-semibold text-gray-600 pt-1">REMARKS</label>
          <textarea placeholder="Remarks" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} className="border rounded px-2 py-1 w-full" rows={2} required />
          {error && <p className="text-red-600 text-xs">{error}</p>}
          <button disabled={busy} className="bg-clinic-600 text-white rounded px-4 py-1.5">{busy ? "Generating..." : "Generate certificate"}</button>
        </form>
      )}

      {lastControlNumber && (
        <p className="text-sm text-green-700 mb-3">Certificate {lastControlNumber} issued and downloaded.</p>
      )}

      <div className="space-y-2">
        {certificates.length === 0 && <p className="text-sm text-gray-400">No medical certificates issued yet.</p>}
        {certificates.map((c) => (
          <div key={c.id} id={`certificate-${c.id}`} className={`bg-white border rounded-lg p-3 ${focusId === c.id ? "ring-2 ring-clinic-400" : ""}`}>
            <div className="w-full flex justify-between items-center gap-2">
              <button onClick={() => setExpanded(expanded === c.id ? null : c.id)} className="flex-1 flex justify-between items-center text-left">
                <span className="font-medium">{c.controlNumber}</span>
                <span className="text-xs text-gray-500">
                  {new Date(c.issuedAt).toLocaleDateString()} — {expanded === c.id ? "Hide" : "Details"}
                </span>
              </button>
              <button onClick={() => redownload(c)} className="text-xs text-clinic-600 underline shrink-0">Download</button>
            </div>
            {expanded === c.id && (
              <div className="mt-2 space-y-1 text-sm text-gray-700 border-t pt-2">
                <div>Examined on: {new Date(c.examDate).toLocaleDateString()}</div>
                <div>Complaints/P.E. Findings: {c.complaints}</div>
                <div>Diagnosis: {c.diagnosis}</div>
                <div>Remarks: {c.remarks}</div>
                <div>Issued by: {c.doctor.fullName}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
