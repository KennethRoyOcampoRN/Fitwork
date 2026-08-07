import React, { useState } from "react";
import { api, ApiError } from "../lib/api";
import { useBranding } from "../lib/branding";
import { deriveCertificatePrefix } from "../lib/certificatePrefix";
import { downloadFile } from "../lib/download";

interface EmployeeResult {
  type: "EMPLOYEE";
  id: string;
  controlNumber: string;
  issuedAt: string;
  employeeCode: string;
  name: string;
  address: string;
  examDate: string;
  complaints: string;
  diagnosis: string;
  remarks: string;
  doctorName: string;
  doctorTitle: string;
}

interface StandaloneResult {
  type: "STANDALONE";
  controlNumber: string;
  issuedAt: string;
  doctorName: string;
}

type Result = EmployeeResult | StandaloneResult;

// Internal-only lookup — Admin, Doctor, Dentist, and Nurse can access it;
// enforced server-side, no public/anonymous verification. A standalone
// certificate returns only the minimal fields ever stored for it (no name,
// address, or content — none of that was persisted at issue time).
export default function CertificateVerification() {
  const branding = useBranding();
  const examplePrefix = branding.certificatePrefix || deriveCertificatePrefix(branding.appName) || "YPI";
  const exampleControlNumber = `${examplePrefix}-${new Date().getFullYear()}-000142`;
  const [controlNumber, setControlNumber] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);

  async function downloadCertificate(result: EmployeeResult) {
    setDownloading(true);
    const err = await downloadFile(`/api/certificates/${result.id}/file`, `medical-certificate-${result.controlNumber}.pdf`);
    if (err) setError(err);
    setDownloading(false);
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    setNotFound(false);
    try {
      const data = await api.get<Result>(`/certificates/verify/${encodeURIComponent(controlNumber.trim())}`);
      setResult(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(true);
      else setError(err instanceof ApiError ? err.message : "Could not verify certificate");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-lg font-bold text-white mb-1">Verify Medical Certificate</h1>
      <p className="text-sm text-gray-500 mb-4">
        Enter a certificate's control number (e.g. {exampleControlNumber}) to confirm it was issued by this clinic.
      </p>

      <form onSubmit={search} className="flex gap-2 mb-4">
        <input
          value={controlNumber}
          onChange={(e) => setControlNumber(e.target.value)}
          placeholder={exampleControlNumber}
          className="flex-1 border rounded px-3 py-1.5 text-sm font-mono"
          required
        />
        <button disabled={busy} className="bg-clinic-600 text-white rounded px-4 py-1.5 text-sm disabled:opacity-50">
          {busy ? "Checking..." : "Verify"}
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {notFound && <p className="text-sm text-red-600">No certificate found with this control number.</p>}

      {result?.type === "EMPLOYEE" && (
        <div className="bg-white border rounded-lg p-4 text-sm space-y-1">
          <div className="flex items-center justify-between mb-2">
            <p className="text-green-700 font-medium">Valid certificate — employee record</p>
            <button
              onClick={() => downloadCertificate(result)}
              disabled={downloading}
              className="text-xs text-clinic-600 underline disabled:opacity-50"
            >
              {downloading ? "Downloading..." : "Download certificate PDF"}
            </button>
          </div>
          <div>Control number: {result.controlNumber}</div>
          <div>Issued: {new Date(result.issuedAt).toLocaleString()}</div>
          <div>Employee code: {result.employeeCode}</div>
          <div>Name: {result.name}</div>
          <div>Address: {result.address}</div>
          <div>Examined on: {new Date(result.examDate).toLocaleDateString()}</div>
          <div>Complaints/P.E. Findings: {result.complaints}</div>
          <div>Diagnosis: {result.diagnosis}</div>
          <div>Remarks: {result.remarks}</div>
          <div>Issued by: {result.doctorName} ({result.doctorTitle})</div>
        </div>
      )}

      {result?.type === "STANDALONE" && (
        <div className="bg-white border rounded-lg p-4 text-sm space-y-1">
          <p className="text-green-700 font-medium mb-2">Valid certificate — standalone (non-employee)</p>
          <div>Control number: {result.controlNumber}</div>
          <div>Issued: {new Date(result.issuedAt).toLocaleString()}</div>
          <div>Issued by: {result.doctorName}</div>
          <p className="text-xs text-gray-400 mt-2">
            No additional content is stored for standalone certificates.
          </p>
        </div>
      )}
    </div>
  );
}
