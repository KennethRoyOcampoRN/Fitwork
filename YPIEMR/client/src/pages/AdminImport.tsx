import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../lib/api";

const IMPORT_TYPES = ["EMPLOYEES", "MEDICATIONS", "HISTORICAL_NOTES", "DRUG_TEST", "PRE_EMPLOYMENT"];

interface FieldChange {
  key: string;
  label: string;
  oldValue: string;
  newValue: string;
}

interface RowOutcome {
  rowNumber: number;
  employeeCode: string;
  employeeNameInFile: string;
  status: "NEW" | "UPDATE" | "ERROR" | "SKIPPED";
  errors: string[];
  warnings: string[];
  changes: FieldChange[];
  data: Record<string, unknown>;
}

interface DryRunResult {
  batchId: string;
  importType: string;
  examYear?: number;
  summary: { total: number; new: number; update: number; error: number; skipped: number };
  rows: RowOutcome[];
}

interface ImportBatch {
  id: string;
  filename: string;
  importType: string;
  status: string;
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  errorCount: number;
  startedAt: string;
  finishedAt: string | null;
  importedBy: { fullName: string };
}

interface CompanyOption { id: string; name: string; isPrimary?: boolean; isActive?: boolean }

export default function AdminImport() {
  const [importType, setImportType] = useState("EMPLOYEES");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<DryRunResult | null>(null);
  const [committed, setCommitted] = useState<ImportBatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<ImportBatch[]>([]);
  const [defaultCompanyId, setDefaultCompanyId] = useState("");
  const [companies, setCompanies] = useState<CompanyOption[]>([]);

  async function loadHistory() {
    setHistory(await api.get<ImportBatch[]>("/imports"));
  }
  useEffect(() => { loadHistory(); }, []);
  useEffect(() => { api.get<CompanyOption[]>("/companies").then(setCompanies); }, []);

  async function generateTemplate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/imports/${importType}/generate`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rosterFill: true }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${importType}-import-template.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate workbook");
    } finally {
      setBusy(false);
    }
  }

  async function runDryRun() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setCommitted(null);
    try {
      const form = new FormData();
      form.append("file", file);
      if (defaultCompanyId) form.append("defaultCompanyId", defaultCompanyId);
      const res = await fetch("/api/imports/dry-run", { method: "POST", credentials: "include", body: form });
      if (!res.ok) throw new ApiError(res.status, (await res.json()).error || "Dry-run failed");
      setResult(await res.json());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Dry-run failed");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!result) return;
    setBusy(true);
    setError(null);
    try {
      const batch = await api.post<ImportBatch>(`/imports/${result.batchId}/commit`, {});
      setCommitted(batch);
      setResult(null);
      setFile(null);
      await loadHistory();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Commit failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border rounded-lg p-4">
        <h2 className="font-medium mb-2">1. Download a template workbook</h2>
        <p className="text-xs text-gray-500 mb-2">For APE templates, use the APE Templates tab instead — this generates the fixed-column workbook for Employees / Medications / Historical Notes.</p>
        <div className="flex gap-2 items-center">
          <select value={importType} onChange={(e) => setImportType(e.target.value)} className="border rounded px-2 py-1 text-sm">
            {IMPORT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
          </select>
          <button onClick={generateTemplate} disabled={busy} className="bg-clinic-600 text-white rounded px-3 py-1.5 text-sm disabled:opacity-50">Download workbook</button>
        </div>
      </div>

      <div className="bg-white border rounded-lg p-4">
        <h2 className="font-medium mb-2">2. Upload the filled-in workbook (any import type — auto-identified from its stamp)</h2>
        <p className="text-xs text-gray-500 mb-2">
          This includes filled-in <strong>APE</strong> workbooks — download those from the{" "}
          <Link to="/admin/templates" className="text-clinic-300 underline">APE Templates tab</Link>, then come back here to upload, dry-run, and commit them. The type selector above only affects step 1.
        </p>
        <div className="flex gap-2 items-center mb-3">
          <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-sm" />
          <button onClick={runDryRun} disabled={busy || !file} className="bg-clinic-600 text-white rounded px-3 py-1.5 text-sm disabled:opacity-50">Run dry-run preview</button>
        </div>
        <div className="border-t pt-3">
          <p className="text-xs text-gray-500 mb-2">
            <strong>APE, Drug Test, and Pre-Employment imports only</strong> — if the file doesn't have its own
            Company Name column filled in per row, this default applies to every row instead.
          </p>
          <div className="flex gap-2 items-center">
            <select value={defaultCompanyId} onChange={(e) => setDefaultCompanyId(e.target.value)} className="border rounded px-2 py-1 text-sm">
              <option value="">Don't set a default</option>
              {companies.filter((c) => c.isActive !== false).map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.isPrimary ? " (Primary)" : ""}</option>
              ))}
            </select>
          </div>
        </div>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </div>

      {result && (
        <div className="bg-white border rounded-lg p-4">
          <div className="flex justify-between items-center mb-2">
            <h2 className="font-medium">Dry-run preview — {result.importType}{result.examYear ? ` (${result.examYear})` : ""}</h2>
            <button onClick={commit} disabled={busy || result.summary.error > 0 && result.summary.new + result.summary.update === 0} className="bg-clinic-600 text-white rounded px-3 py-1.5 text-sm disabled:opacity-50">
              {busy ? "Committing..." : "Commit import"}
            </button>
          </div>
          <div className="flex gap-4 text-sm mb-3">
            <span>Total: {result.summary.total}</span>
            <span className="text-green-700">New: {result.summary.new}</span>
            <span className="text-blue-700">Update: {result.summary.update}</span>
            <span className="text-red-700">Error: {result.summary.error}</span>
            <span className="text-gray-500">Skipped: {result.summary.skipped}</span>
          </div>
          <div className="overflow-x-auto max-h-96 overflow-y-auto border rounded">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left sticky top-0">
                <tr><th className="p-2">Row</th><th className="p-2">Code</th><th className="p-2">Status</th><th className="p-2">Details</th></tr>
              </thead>
              <tbody className="divide-y">
                {result.rows.map((r) => (
                  <tr key={r.rowNumber}>
                    <td className="p-2 align-top">{r.rowNumber}</td>
                    <td className="p-2 align-top">{r.employeeCode || "—"}</td>
                    <td className="p-2 align-top">
                      <span className={
                        r.status === "NEW" ? "text-green-700" :
                        r.status === "UPDATE" ? "text-blue-700" :
                        r.status === "ERROR" ? "text-red-700" : "text-gray-400"
                      }>{r.status}</span>
                    </td>
                    <td className="p-2 text-xs text-gray-600 align-top">
                      {r.warnings.map((w, i) => (
                        <div key={i} className="text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 mb-1">⚠ {w}</div>
                      ))}
                      {r.errors.length > 0 && <div className="text-red-700">{r.errors.join("; ")}</div>}
                      {r.changes.length > 0 && (
                        <ul className="space-y-0.5">
                          {r.changes.map((c) => (
                            <li key={c.key}>
                              <span className="font-medium text-gray-700">{c.label}:</span>{" "}
                              <span className="text-gray-400 line-through">{c.oldValue}</span>{" "}
                              <span className="text-gray-400">→</span>{" "}
                              <span className="text-gray-900">{c.newValue}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {r.status === "NEW" && r.employeeCode && <span className="text-gray-400">New record</span>}
                      {r.status === "SKIPPED" && r.errors.length === 0 && (
                        <span className="text-gray-400">{r.employeeCode ? "No changes from existing record" : "Nothing to import"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {committed && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm">
          Import committed: {committed.createdCount} created, {committed.updatedCount} updated.
          <a href={`/api/imports/${committed.id}/report`} className="text-clinic-300 underline ml-2">Download result report</a>
        </div>
      )}

      <div className="bg-white border rounded-lg">
        <h2 className="font-medium p-4 pb-0">Import history</h2>
        <p className="text-xs text-gray-500 px-4 pb-2">
          A dry-run preview that was never committed is greyed out with a "Not committed" badge — nothing from that
          run was ever written to the database.
        </p>
        <table className="w-full text-sm mt-2">
          <thead className="bg-gray-50 text-left">
            <tr><th className="p-2">Date</th><th className="p-2">Type</th><th className="p-2">File</th><th className="p-2">Status</th><th className="p-2">New/Updated/Errors</th><th className="p-2">By</th><th className="p-2"></th></tr>
          </thead>
          <tbody className="divide-y">
            {history.map((b) => {
              const notCommitted = b.status === "DRY_RUN";
              return (
                <tr key={b.id} className={notCommitted ? "text-gray-400" : ""}>
                  <td className="p-2">{new Date(b.startedAt).toLocaleString()}</td>
                  <td className="p-2">{b.importType}</td>
                  <td className="p-2">{b.filename}</td>
                  <td className="p-2">
                    {b.status}
                    {notCommitted && (
                      <span
                        className="ml-2 text-xs bg-gray-200 text-gray-600 rounded px-1.5 py-0.5"
                        title="This dry-run preview was never committed — no data from it was written to the database."
                      >
                        Not committed
                      </span>
                    )}
                  </td>
                  <td className="p-2">{b.createdCount}/{b.updatedCount}/{b.errorCount}</td>
                  <td className="p-2">{b.importedBy.fullName}</td>
                  <td className="p-2">{b.status === "COMMITTED" && <a href={`/api/imports/${b.id}/report`} className="text-xs text-clinic-300 underline">Report</a>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
