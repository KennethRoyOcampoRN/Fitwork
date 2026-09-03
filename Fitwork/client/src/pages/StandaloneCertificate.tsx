import React, { useEffect, useRef, useState } from "react";
import { ApiError } from "../lib/api";
import { printObjectUrl } from "../lib/download";

const EMPTY_FORM = {
  name: "", address: "",
  examDate: new Date().toISOString().slice(0, 10),
  complaints: "", diagnosis: "", remarks: "",
};

// For patients with no employee record in the system. Nothing about this
// certificate's content (name, address, complaints, diagnosis, remarks) is
// ever persisted — only a minimal verification record (control number,
// issue date, issuing doctor) is stored, in its own table, entirely
// separate from any employee data.
export default function StandaloneCertificate() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issuedControlNumber, setIssuedControlNumber] = useState<string | null>(null);
  // Kept alive (not revoked at download time) so the "Print" button below
  // can reuse the same blob instead of re-generating the certificate — a
  // standalone certificate's PDF is never written to disk (see the file
  // header comment), so there's no /:id/file to print from later the way
  // CertificateTab's employee certificates can.
  const lastObjectUrlRef = useRef<string | null>(null);

  function revokeLastObjectUrl() {
    if (lastObjectUrlRef.current) {
      URL.revokeObjectURL(lastObjectUrlRef.current);
      lastObjectUrlRef.current = null;
    }
  }

  useEffect(() => () => revokeLastObjectUrl(), []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setIssuedControlNumber(null);
    revokeLastObjectUrl();
    try {
      const res = await fetch("/api/certificates/standalone", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new ApiError(res.status, data.error || "Could not generate certificate");
      }
      const controlNumber = res.headers.get("X-Control-Number");
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      lastObjectUrlRef.current = objectUrl;
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `medical-certificate-${controlNumber || "certificate"}.pdf`;
      a.click();

      setIssuedControlNumber(controlNumber);
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not generate certificate");
    } finally {
      setBusy(false);
    }
  }

  function printLast() {
    if (lastObjectUrlRef.current) printObjectUrl(lastObjectUrlRef.current);
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-lg font-bold text-white mb-1">Standalone Medical Certificate</h1>
      <p className="text-sm text-gray-500 mb-4">
        For a person with no employee record in this system (e.g. a walk-in or visitor). Only a minimal verification
        record — control number, issue date, and issuing doctor — is kept; none of the content entered below is
        saved anywhere.
      </p>

      <form onSubmit={submit} className="bg-white border rounded-xl p-4 space-y-2 text-sm">
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
        {issuedControlNumber && (
          <p className="text-green-700 text-xs flex items-center gap-2">
            Certificate {issuedControlNumber} issued and downloaded.
            <button type="button" onClick={printLast} className="text-clinic-600 underline shrink-0">Print</button>
          </p>
        )}
        <button disabled={busy} className="bg-clinic-600 text-white rounded px-4 py-1.5">{busy ? "Generating..." : "Generate certificate"}</button>
      </form>
    </div>
  );
}
