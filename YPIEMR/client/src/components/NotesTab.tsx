import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { ClinicalNote, NOTE_TYPE_LABEL, ROLE_NOTE_TYPE } from "../lib/noteTypes";
import NoteCard from "./NoteCard";

export default function NotesTab({ employeeId, noteType, focusId }: { employeeId: string; noteType: string; focusId?: string | null }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notes, setNotes] = useState<ClinicalNote[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const data = await api.get<ClinicalNote[]>(`/notes?employeeId=${employeeId}&noteType=${noteType}`);
    setNotes(data);
    setLoading(false);
  }

  useEffect(() => { load(); }, [employeeId, noteType]);

  useEffect(() => {
    if (!focusId || loading) return;
    document.getElementById(`note-${focusId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusId, loading]);

  const canAuthor = user && ROLE_NOTE_TYPE[user.role] === noteType;

  return (
    <div className="space-y-3">
      {canAuthor && (
        <button
          onClick={() => navigate(`/employees/${employeeId}/notes/new`)}
          className="bg-clinic-600 text-white rounded px-3 py-1.5 text-sm"
        >
          + New {NOTE_TYPE_LABEL[noteType]}
        </button>
      )}
      {loading && <p className="text-sm text-gray-400">Loading...</p>}
      {!loading && notes.length === 0 && <p className="text-sm text-gray-400">No {NOTE_TYPE_LABEL[noteType].toLowerCase()}s recorded yet.</p>}
      {notes.map((n) => (
        <div key={n.id} id={`note-${n.id}`} className={focusId === n.id ? "ring-2 ring-clinic-400 rounded-lg" : ""}>
          <NoteCard note={n} onChanged={load} />
        </div>
      ))}
    </div>
  );
}
