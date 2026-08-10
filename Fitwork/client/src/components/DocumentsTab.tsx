import React, { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import PermanentDeleteButton from "./PermanentDeleteButton";
import { IconArchiveBox } from "./icons";
import LabelCombobox, { LabelComboboxHandle, LabelOption } from "./LabelCombobox";

interface Doc {
  id: string;
  category: string;
  title: string;
  labelId: string | null;
  label: LabelOption | null;
  documentDate: string | null;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  notes: string | null;
  resultStatus: string | null;
  isArchived: boolean;
  archiveReason: string | null;
  createdAt: string;
  uploadedBy: { fullName: string };
}

const CATEGORIES = ["LABORATORY", "IMAGING", "APE", "DENTAL", "MEDICAL_CERTIFICATE", "CLEARANCE", "VACCINATION", "OTHER"];
const RESULT_STATUSES = ["NORMAL", "ABNORMAL", "PENDING"];
const RESULT_STATUS_COLORS: Record<string, string> = {
  ABNORMAL: "bg-red-100 text-red-800",
  PENDING: "bg-amber-100 text-amber-800",
  NORMAL: "bg-gray-100",
};

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
  const [onlyUnlabeled, setOnlyUnlabeled] = useState(false);
  const [relabelDoc, setRelabelDoc] = useState<Doc | null>(null);

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
  const visibleDocs = onlyUnlabeled ? docs.filter((d) => !d.labelId) : docs;
  const unlabeledCount = docs.filter((d) => !d.labelId).length;

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3 items-center">
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="border rounded px-2 py-1 text-sm">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border rounded px-2 py-1 text-sm" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border rounded px-2 py-1 text-sm" />
        {unlabeledCount > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-amber-800">
            <input type="checkbox" checked={onlyUnlabeled} onChange={(e) => setOnlyUnlabeled(e.target.checked)} />
            Needs label ({unlabeledCount})
          </label>
        )}
        <button onClick={() => setShowUpload(true)} className="ml-auto bg-clinic-600 text-white rounded px-3 py-1.5 text-sm">+ Upload document</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {visibleDocs.length === 0 && <p className="text-sm text-gray-400 col-span-full">{onlyUnlabeled ? "No documents need a label." : "No documents uploaded yet."}</p>}
        {visibleDocs.map((d) => (
          <div key={d.id} id={`doc-${d.id}`} className={`bg-white border rounded-xl p-3 text-sm ${d.isArchived ? "opacity-60" : ""} ${focusId === d.id ? "ring-2 ring-clinic-400" : ""}`}>
            <div className="flex justify-between items-start gap-1">
              <span className="text-xs bg-gray-100 rounded px-1.5 py-0.5">{d.category.replace(/_/g, " ")}</span>
              <div className="flex items-center gap-1">
                {d.resultStatus && (
                  <span className={`text-xs rounded px-1.5 py-0.5 ${RESULT_STATUS_COLORS[d.resultStatus] || "bg-gray-100"}`}>{d.resultStatus}</span>
                )}
                {d.isArchived && <span className="text-xs text-red-600">Archived</span>}
              </div>
            </div>
            <div className="font-medium mt-1">{d.title}</div>
            {!d.labelId && (
              <button onClick={() => setRelabelDoc(d)} className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 mt-1 inline-block">
                ⚠ Needs label — Assign
              </button>
            )}
            <div className="text-xs text-gray-500 mt-1">{d.originalFilename} · {formatBytes(d.fileSizeBytes)}</div>
            <div className="text-xs text-gray-400">{d.documentDate ? new Date(d.documentDate).toLocaleDateString() : new Date(d.createdAt).toLocaleDateString()} · {d.uploadedBy.fullName}</div>
            {d.isArchived && <div className="text-xs text-red-600 mt-1">Reason: {d.archiveReason}</div>}
            <div className="flex flex-col gap-2 mt-2">
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={() => setPreviewId(d.id)} className="text-xs text-clinic-300 underline">Preview</button>
                <a href={`/api/documents/${d.id}/file`} download={d.originalFilename} className="text-xs text-clinic-300 underline">Download</a>
                {d.labelId && <button onClick={() => setRelabelDoc(d)} className="text-xs text-clinic-300 underline">Change label</button>}
              </div>
              {!d.isArchived && (
                <button
                  onClick={() => archive(d)}
                  className="inline-flex items-center gap-1 self-start shrink-0 whitespace-nowrap border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 rounded px-2 py-1 text-xs font-medium transition-colors"
                >
                  <IconArchiveBox className="w-3 h-3" /> Archive
                </button>
              )}
              {user?.role === "ADMIN" && (
                <div className="self-start">
                  <PermanentDeleteButton
                    description={`${d.category.replace(/_/g, " ")} document "${d.title}" (${d.originalFilename}), uploaded by ${d.uploadedBy.fullName}.`}
                    onDelete={async (reason) => { await api.delete(`/documents/${d.id}`, { reason }); await load(); }}
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {showUpload && (
        <UploadModal employeeId={employeeId} onClose={() => setShowUpload(false)} onUploaded={load} />
      )}

      {relabelDoc && (
        <RelabelModal doc={relabelDoc} onClose={() => setRelabelDoc(null)} onRelabeled={load} />
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
  const [documentDate, setDocumentDate] = useState("");
  const [notes, setNotes] = useState("");
  const [resultStatus, setResultStatus] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const labelRef = useRef<LabelComboboxHandle>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const label = await labelRef.current?.resolve();
      if (!label) { setError("Pick or type a label"); return; }

      const form = new FormData();
      form.append("employeeId", employeeId);
      form.append("category", category);
      form.append("labelId", label.id);
      if (documentDate) form.append("documentDate", documentDate);
      if (notes) form.append("notes", notes);
      if (resultStatus) form.append("resultStatus", resultStatus);
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
        <LabelCombobox key={category} ref={labelRef} category={category} placeholder="Label (e.g. CBC, Chest X-ray)..." />
        <input type="date" value={documentDate} onChange={(e) => setDocumentDate(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
        <select value={resultStatus} onChange={(e) => setResultStatus(e.target.value)} className="w-full border rounded px-2 py-1 text-sm">
          <option value="">Result status (optional)</option>
          {RESULT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
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

function RelabelModal({ doc, onClose, onRelabeled }: { doc: Doc; onClose: () => void; onRelabeled: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const labelRef = useRef<LabelComboboxHandle>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const label = await labelRef.current?.resolve();
      if (!label) { setError("Pick or type a label"); return; }
      await api.patch(`/documents/${doc.id}/label`, { labelId: label.id });
      onRelabeled();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not assign label");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <form onSubmit={submit} className="bg-white rounded-xl p-4 w-full max-w-md space-y-2">
        <div className="flex justify-between items-center mb-1">
          <h2 className="font-semibold">Assign label</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <p className="text-xs text-gray-500">
          {doc.category.replace(/_/g, " ")} document currently titled "{doc.title}", uploaded by {doc.uploadedBy.fullName}.
        </p>
        <LabelCombobox ref={labelRef} category={doc.category} initial={doc.label} placeholder="Label (e.g. CBC, Chest X-ray)..." />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm">Cancel</button>
          <button type="submit" disabled={busy} className="bg-clinic-600 text-white rounded px-4 py-2 text-sm disabled:opacity-50">{busy ? "Saving..." : "Save"}</button>
        </div>
      </form>
    </div>
  );
}
