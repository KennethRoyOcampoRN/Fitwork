import React, { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { api } from "../lib/api";

export interface LabelOption {
  id: string;
  name: string;
}

export interface LabelComboboxHandle {
  // Resolves the current input to a label: an exact case-insensitive match
  // against the category's existing labels, or a brand-new one created on
  // the spot via the get-or-create endpoint — the standard "pick existing
  // or type a new option" combobox pattern. Returns null if the input is
  // blank, so the caller can block submit.
  resolve: () => Promise<LabelOption | null>;
}

interface Props {
  category: string;
  initial?: LabelOption | null;
  placeholder?: string;
}

// Category-scoped label picker for Labs & Documents uploads (e.g. "CBC"
// under LABORATORY) — any authenticated clinical role can pick an existing
// label from the list or type a new one, which gets saved for everyone to
// reuse going forward. Deliberately uncontrolled/ref-based (see resolve()
// above) rather than a value/onChange pair, since the actual label often
// isn't resolved until submit time (typed-but-not-yet-selected text).
const LabelCombobox = forwardRef<LabelComboboxHandle, Props>(function LabelCombobox(
  { category, initial, placeholder },
  ref
) {
  const [labels, setLabels] = useState<LabelOption[]>([]);
  const [text, setText] = useState(initial?.name || "");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<LabelOption[]>(`/document-labels?category=${encodeURIComponent(category)}`).then(setLabels).catch(() => setLabels([]));
  }, [category]);

  useImperativeHandle(ref, () => ({
    async resolve() {
      const trimmed = text.trim();
      if (!trimmed) return null;
      const existing = labels.find((l) => l.name.trim().toLowerCase() === trimmed.toLowerCase());
      if (existing) return existing;

      setBusy(true);
      try {
        const created = await api.post<LabelOption>("/document-labels", { category, name: trimmed });
        setLabels((cur) => (cur.some((l) => l.id === created.id) ? cur : [...cur, created].sort((a, b) => a.name.localeCompare(b.name))));
        setText(created.name);
        return created;
      } finally {
        setBusy(false);
      }
    },
  }), [text, labels, category]);

  const filtered = text.trim()
    ? labels.filter((l) => l.name.toLowerCase().includes(text.trim().toLowerCase()))
    : labels;
  const exactMatch = labels.some((l) => l.name.trim().toLowerCase() === text.trim().toLowerCase());

  function select(l: LabelOption) {
    setText(l.name);
    setOpen(false);
  }

  return (
    <div className="relative">
      <input
        value={text}
        onChange={(e) => { setText(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder || "Pick or type a label..."}
        className="w-full border rounded px-2 py-1 text-sm"
        disabled={busy}
        required
      />
      {open && (filtered.length > 0 || (text.trim() && !exactMatch)) && (
        <div className="absolute z-10 mt-1 w-full border rounded bg-white shadow-sm max-h-48 overflow-auto">
          {filtered.map((l) => (
            <button
              key={l.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(l)}
              className="block w-full text-left px-2 py-1 text-sm hover:bg-gray-50"
            >
              {l.name}
            </button>
          ))}
          {text.trim() && !exactMatch && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setOpen(false)}
              className="block w-full text-left px-2 py-1 text-sm text-clinic-300 hover:bg-gray-50 border-t"
            >
              + Create new label: "{text.trim()}"
            </button>
          )}
        </div>
      )}
    </div>
  );
});

export default LabelCombobox;
