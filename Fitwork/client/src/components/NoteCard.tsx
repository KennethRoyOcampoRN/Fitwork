import React, { useState } from "react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { ClinicalNote, ILLNESS_CATEGORY_LABEL, NOTE_FIELDS_BY_TYPE, NOTE_TYPE_LABEL, NoteFieldKey } from "../lib/noteTypes";
import EditCountdown from "./EditCountdown";
import PermanentDeleteButton from "./PermanentDeleteButton";

export default function NoteCard({ note, onChanged }: { note: ClinicalNote; onChanged: () => void }) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [addendumBody, setAddendumBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAuthor = user?.id === note.authorId;
  const isEditable = isAuthor && note.editableUntil && new Date(note.editableUntil) > new Date() && note.status === "FINAL";
  const canAddendum = user?.role !== "ADMIN";
  const canVoid = isAuthor && note.status === "FINAL";

  async function submitAddendum(e: React.FormEvent) {
    e.preventDefault();
    if (!addendumBody.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/notes/${note.id}/addendum`, { body: addendumBody });
      setAddendumBody("");
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add addendum");
    } finally {
      setBusy(false);
    }
  }

  async function doVoid() {
    const reason = prompt("Reason for voiding this note (required):");
    if (!reason || !reason.trim()) return;
    setBusy(true);
    try {
      await api.post(`/notes/${note.id}/void`, { reason });
      onChanged();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Could not void note");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`bg-white border rounded-xl p-4 ${note.status === "VOIDED" ? "opacity-70" : ""}`}>
      <div className="flex justify-between items-start mb-2">
        <div>
          <span className="font-medium">{note.author.fullName}</span>
          {note.author.isActive === false && <span className="text-gray-400 text-xs"> (inactive)</span>}
          <span className="text-gray-400 text-xs ml-2">{new Date(note.visitDateTime).toLocaleString()}</span>
          {note.visitCategory && <span className="text-xs bg-gray-100 rounded px-1.5 py-0.5 ml-2">{note.visitCategory.replace("_", " ")}</span>}
          {note.isWorkRelated && <span className="text-xs bg-orange-100 text-orange-800 rounded px-1.5 py-0.5 ml-2">Work-related</span>}
        </div>
        <div className="flex items-center gap-2">
          {isEditable && <EditCountdown editableUntil={note.editableUntil!} />}
          {isEditable && <button onClick={() => setEditing((e) => !e)} className="text-xs text-clinic-300 underline">{editing ? "Cancel" : "Edit"}</button>}
          {canVoid && !editing && (
            <button
              onClick={doVoid}
              className="bg-[#D33B3B] hover:bg-[#B93232] text-white rounded px-2 py-1 text-xs font-medium transition-colors"
            >
              Void
            </button>
          )}
          {user?.role === "ADMIN" && (
            <PermanentDeleteButton
              description={`${NOTE_TYPE_LABEL[note.noteType] || "Note"} dated ${new Date(note.visitDateTime).toLocaleString()} for this employee, authored by ${note.author.fullName}.`}
              onDelete={async (reason) => { await api.delete(`/notes/${note.id}`, { reason }); onChanged(); }}
            />
          )}
        </div>
      </div>

      {note.status === "VOIDED" && (
        <div className="text-sm text-red-700 mb-2 line-through">
          VOIDED — {note.voidReason}
        </div>
      )}

      {editing ? (
        <NoteEditForm note={note} onDone={() => { setEditing(false); onChanged(); }} />
      ) : (
        <div className={`text-sm space-y-1 ${note.status === "VOIDED" ? "line-through" : ""}`}>
          {NOTE_FIELDS_BY_TYPE[note.noteType]?.map((f) => (
            note[f.key] ? <p key={f.key}><span className="font-medium">{f.label}:</span> {note[f.key]}</p> : null
          ))}
          {note.illnessCategory && <p><span className="font-medium">Category:</span> {ILLNESS_CATEGORY_LABEL[note.illnessCategory] || note.illnessCategory}</p>}
          {note.disposition && <p><span className="font-medium">Disposition:</span> {note.disposition.replace(/_/g, " ")}</p>}
          {note.referredTo && <p><span className="font-medium">Referred to:</span> {note.referredTo}</p>}
          {note.followUpDate && <p><span className="font-medium">Follow-up:</span> {new Date(note.followUpDate).toLocaleDateString()}</p>}
        </div>
      )}

      {note.addenda.length > 0 && (
        <div className="mt-3 border-t pt-2 space-y-2">
          {note.addenda.map((a) => (
            <div key={a.id} className="text-sm bg-gray-50 rounded p-2">
              <div className="text-xs text-gray-500 mb-1">{a.author.fullName} · {new Date(a.createdAt).toLocaleString()}</div>
              {a.body}
            </div>
          ))}
        </div>
      )}

      {canAddendum && note.status === "FINAL" && (
        <form onSubmit={submitAddendum} className="mt-3 flex gap-2">
          <input
            value={addendumBody}
            onChange={(e) => setAddendumBody(e.target.value)}
            placeholder="Add an addendum..."
            className="flex-1 border rounded px-2 py-1 text-sm"
          />
          <button disabled={busy} className="text-sm bg-gray-100 hover:bg-gray-200 rounded px-3 py-1">Add</button>
        </form>
      )}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

function NoteEditForm({ note, onDone }: { note: ClinicalNote; onDone: () => void }) {
  const fields = NOTE_FIELDS_BY_TYPE[note.noteType] || [];
  const [form, setForm] = useState<Record<NoteFieldKey, string>>(() => {
    const initial = {} as Record<NoteFieldKey, string>;
    for (const f of fields) initial[f.key] = note[f.key] || "";
    return initial;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/notes/${note.id}`, form);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save edit");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-2 text-sm">
      {fields.map((f) => (
        <textarea
          key={f.key}
          placeholder={f.label}
          value={form[f.key]}
          onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
          className="w-full border rounded px-2 py-1"
          rows={2}
        />
      ))}
      {error && <p className="text-red-600 text-xs">{error}</p>}
      <button disabled={busy} className="bg-clinic-600 text-white rounded px-3 py-1">{busy ? "Saving..." : "Save correction"}</button>
    </form>
  );
}
