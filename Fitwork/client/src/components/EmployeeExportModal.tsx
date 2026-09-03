import React, { useState } from "react";
import { printFile } from "../lib/download";

const CATEGORIES = [
  { value: "DOCTOR", label: "Doctor's Notes" },
  { value: "NURSE", label: "Nurse's Notes" },
  { value: "DENTIST", label: "Dentist's Notes" },
  { value: "MEDICATIONS", label: "Medications" },
  { value: "APE", label: "Annual Physical Exams" },
  { value: "VITALS", label: "Vitals" },
  { value: "DRUG_TEST", label: "Drug Test Results" },
  { value: "PRE_EMPLOYMENT", label: "Pre-Employment Exams" },
];

export default function EmployeeExportModal({
  employeeId,
  employeeCode,
  onClose,
}: {
  employeeId: string;
  employeeCode: string;
  onClose: () => void;
}) {
  const [categories, setCategories] = useState<string[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(value: string) {
    setCategories((cur) => cur.includes(value) ? cur.filter((c) => c !== value) : [...cur, value]);
  }

  function exportUrl(): string | null {
    if (categories.length === 0) {
      setError("Select at least one category");
      return null;
    }
    const params = new URLSearchParams({ categories: categories.join(",") });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return `/api/employees/${employeeId}/export?${params.toString()}`;
  }

  async function download() {
    const url = exportUrl();
    if (!url) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).error || "Export failed");
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `${employeeCode}-export-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(objectUrl);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  async function print() {
    const url = exportUrl();
    if (!url) return;
    setBusy(true);
    setError(null);
    const err = await printFile(url);
    if (err) setError(err);
    else onClose();
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-4 w-full max-w-md">
        <div className="flex justify-between items-center mb-2">
          <h2 className="font-semibold">Export medical record</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <p className="text-sm text-gray-500 mb-3">
          Select which categories to include — downloads as one combined PDF, laid out like a printed patient chart.
        </p>
        <div className="grid grid-cols-2 gap-1.5 mb-3">
          {CATEGORIES.map((c) => (
            <label key={c.value} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={categories.includes(c.value)} onChange={() => toggle(c.value)} />
              {c.label}
            </label>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 mb-1">
          <div>
            <label className="block text-xs font-medium mb-1">From (optional)</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">To (optional)</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
          </div>
        </div>
        <p className="text-xs text-gray-400 mb-3">Leave From/To blank to export full history.</p>
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="px-4 py-2 text-sm">Cancel</button>
          <button onClick={print} disabled={busy} className="border border-clinic-300 text-clinic-600 rounded px-4 py-2 text-sm disabled:opacity-50">
            {busy ? "Preparing..." : "Print"}
          </button>
          <button onClick={download} disabled={busy} className="bg-clinic-600 text-white rounded px-4 py-2 text-sm disabled:opacity-50">
            {busy ? "Preparing..." : "Download PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}
