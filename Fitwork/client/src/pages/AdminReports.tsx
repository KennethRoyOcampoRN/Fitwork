import React, { useState } from "react";

const CATEGORIES = [
  { value: "DOCTOR", label: "Doctor's Notes" },
  { value: "NURSE", label: "Nurse's Notes" },
  { value: "DENTIST", label: "Dentist's Notes" },
  { value: "MEDICATIONS", label: "Medications" },
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AdminReports() {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [categories, setCategories] = useState<string[]>(CATEGORIES.map((c) => c.value));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(value: string) {
    setCategories((cur) => cur.includes(value) ? cur.filter((c) => c !== value) : [...cur, value]);
  }

  async function download() {
    if (categories.length === 0) {
      setError("Select at least one category");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from, to, categories: categories.join(",") });
      const res = await fetch(`/api/notes/reports/export?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).error || "Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `clinic-report-${from}_to_${to}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="text-lg font-semibold mb-2">Clinic Reports</h1>
      <p className="text-sm text-gray-500 mb-4">
        Export any combination of Doctor's, Nurse's, and Dentist's Notes, and Medications dispensed, for a single day
        or a custom date range, across all employees. Downloads as one PDF, laid out like a printed patient chart,
        suitable for physical/official records. Medications are always their own standalone section — never bundled
        into a note entry.
      </p>
      <div className="bg-white border rounded-xl p-4 max-w-xl space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
          </div>
        </div>
        <p className="text-xs text-gray-400">For a single day, set From and To to the same date.</p>
        <div>
          <label className="block text-sm font-medium mb-1">Include</label>
          <div className="grid grid-cols-2 gap-1.5">
            {CATEGORIES.map((c) => (
              <label key={c.value} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={categories.includes(c.value)} onChange={() => toggle(c.value)} />
                {c.label}
              </label>
            ))}
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button onClick={download} disabled={busy || !from || !to} className="bg-clinic-600 text-white rounded px-4 py-2 text-sm disabled:opacity-50">
          {busy ? "Preparing..." : "Download report"}
        </button>
      </div>
    </div>
  );
}
