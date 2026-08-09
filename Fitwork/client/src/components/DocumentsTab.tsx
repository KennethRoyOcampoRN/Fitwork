import React, { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import PermanentDeleteButton from "./PermanentDeleteButton";

interface Doc {
  id: string;
  category: string;
  title: string;
  documentDate: string | null;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  notes: string | null;
  isArchived: boolean;
  archiveReason: string | null;
  createdAt: string;
  uploadedBy: { fullName: string };
}

const CATEGORIES = ["LABORATORY", "IMAGING", "APE", "DENTAL", "MEDICAL_CERTIFICATE", "CLEARANCE", "VACCINATION", "OTHER"];

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsTab({ employeeId, focusId }: { employeeId: string; focusId?: string | null }) {
  const { user } = useAuth();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);

  async function load() {
    const params = new URLSearchParams({ employeeId });
    if (categoryFilter) params.set("category", categoryFilter);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    setDocs(await api.get<Doc[]>(`/documents?${params.toString()}`));
  }

  useEffect(() => { load(); }, [employeeId, categoryFilter, from, to]);

  useEffect(() => {
    if (!focusId) return;
    document.getElementById(`doc-${focusId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusId, docs]);

  async function archive(doc: Doc) {
    const reason = prompt(`Reason for archiving "${doc.title}" (required):`);
    if (!reason || !reason.trim()) return;
    await api.post(`/documents/${doc.id}/archive`, { reason });
    await load();
  }

  const preview = docs.find((d) => d.id === previewId);

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3 items-center">
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="border rounded px-2 py-1 text-sm">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border rounded px-2 py-1 text-sm" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border rounded px-2 py-1 text-sm" />
        <button onClick={() => setShowUpload(true)} className="ml-auto bg-clinic-600 text-white rounded px-3 py-1.5 text-sm">+ Upload document</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {docs.length === 0 && <p className="text-sm text-gray-400 col-span-full">No documents uploaded yet.</p>}
        {docs.map((d) => (
          <div key={d.id} id={`doc-${d.id}`} className={`bg-white border rounded-xl p-3 text-sm ${d.isArchived ? "opacity-60" : ""} ${focusId === d.id ? "ring-2 ring-clinic-400" : ""}`}>
            <div className="flex justify-between items-start">
              <span className="text-xs bg-gray-100 rounded px-1.5 py-0.5">{d.category.replace(/_/g, " ")}</span>
              {d.isArchived && <span className="text-xs text-red-600">Archived</span>}
            </div>
            <div className="font-medium mt-1">{d.title}</div>
            <div className="text-xs text-gray-500">{d.originalFilename} · {formatBytes(d.fileSizeBytes)}</div>
            <div className="text-xs text-gray-400">{d.documentDate ? new Date(d.documentDate).toLocaleDateString() : new Date(d.createdAt).toLocaleDateString()} · {d.uploadedBy.fullName}</div>
            {d.isArchived && <div className="text-xs text-red-600 mt-1">Reason: {d.archiveReason}</div>}
            <div className="flex gap-3 mt-2">
              <button onClick={() => setPreviewId(d.id)} className="text-xs text-clinic-300 underline">Preview</button>
              <a href={`/api/documents/${d.id}/file`} download={d.originalFilename} className="text-xs text-clinic-300 underline">Download</a>
              {!d.isArchived && <button onClick={() => archive(d)} className="text-xs text-red-600 underline">Archive</button>}
              {user?.role === "ADMIN" && (
                <PermanentDeleteButton
                  description={`${d.category.replace(/_/g, " ")} document "${d.title}" (${d.originalFilename}), uploaded by ${d.uploadedBy.fullName}.`}
                  onDelete={async (reason) => { await api.delete(`/documents/${d.id}`, { reason }); await load(); }}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      {showUpload && (
        <UploadModal employeeId={employeeId} onClose={() => setShowUpload(false)} onUploaded={load} />
      )}

      {preview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-4 w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center mb-2">
              <h2 className="font-semibold">{preview.title}</h2>
              <button onClick={() => setPreviewId(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="flex-1 overflow-auto">
              {preview.mimeType.startsWith("image/") && (
                <img src={`/api/documents/${preview.id}/file`} className="max-w-full mx-auto" />
              )}
              {preview.mimeType === "application/pdf" && (
                <iframe src={`/api/documents/${preview.id}/file`} className="w-full h-[75vh]" />
              )}
              {!preview.mimeType.startsWith("image/") && preview.mimeType !== "application/pdf" && (
                <p className="text-sm text-gray-500">No inline preview available for this file type — use Download instead.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UploadModal({ employeeId, onClose, onUploaded }: { employeeId: string; onClose: () => void; onUploaded: () => void }) {
  const [category, setCategory] = useState("LABORATORY");
  const [title, setTitle] = useState("");
  const [documentDate, setDocumentDate] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("employeeId", employeeId);
      form.append("category", category);
      form.append("title", title);
      if (documentDate) form.append("documentDate", documentDate);
      if (notes) form.append("notes", notes);
      form.append("file", file);
      const res = await fetch("/api/documents", { method: "POST", credentials: "include", body: form });
      if (!res.ok) throw new ApiError(res.status, (await res.json()).error || "Upload failed");
      onUploaded();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <form onSubmit={submit} className="bg-white rounded-xl p-4 w-full max-w-md space-y-2">
        <div className="flex justify-between items-center mb-1">
          <h2 className="font-semibold">Upload document</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full border rounded px-2 py-1 text-sm">
          {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
        </select>
        <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" required />
        <input type="date" value={documentDate} onChange={(e) => setDocumentDate(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
        <textarea placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" rows={2} />
        <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.docx" onChange={(e) => setFile(e.target.files?.[0] || null)} className="w-full text-sm" required />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm">Cancel</button>
          <button type="submit" disabled={busy} className="bg-clinic-600 text-white rounded px-4 py-2 text-sm disabled:opacity-50">{busy ? "Uploading..." : "Upload"}</button>
        </div>
      </form>
    </div>
  );
}
