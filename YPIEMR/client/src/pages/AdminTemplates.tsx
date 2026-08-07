import React, { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";

interface CatalogField {
  key: string;
  label: string;
  dataType: string;
  options?: string[];
  unit?: string;
  section?: string;
  mapsToCoreColumn?: string;
}

interface TemplateField extends CatalogField {
  id?: string;
  isRequired?: boolean;
}

interface Template {
  id: string;
  name: string;
  version: number;
  isLocked: boolean;
  notes: string | null;
  fields: TemplateField[];
  createdBy: { fullName: string };
}

const DATA_TYPES = ["TEXT", "NUMBER", "DATE", "SELECT", "BOOLEAN"];

export default function AdminTemplates() {
  const [catalog, setCatalog] = useState<CatalogField[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showBuilder, setShowBuilder] = useState<Template | null>(null);
  const [generateFor, setGenerateFor] = useState<Template | null>(null);

  async function load() {
    setCatalog(await api.get<CatalogField[]>("/templates/catalog"));
    setTemplates(await api.get<Template[]>("/templates"));
  }
  useEffect(() => { load(); }, []);

  // Show only the latest version of each named template in the main list
  const latestByName = new Map<string, Template>();
  for (const t of templates) {
    const existing = latestByName.get(t.name);
    if (!existing || t.version > existing.version) latestByName.set(t.name, t);
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h2 className="font-medium">APE Templates</h2>
        <button onClick={() => setShowBuilder({ id: "", name: "", version: 1, isLocked: false, notes: "", fields: [], createdBy: { fullName: "" } })} className="bg-clinic-600 text-white rounded px-3 py-1.5 text-sm">
          + New template
        </button>
      </div>

      <div className="bg-white border rounded-lg divide-y">
        {[...latestByName.values()].length === 0 && <div className="p-4 text-sm text-gray-400">No templates yet.</div>}
        {[...latestByName.values()].map((t) => (
          <div key={t.id} className="p-3 flex justify-between items-center">
            <div>
              <div className="font-medium">{t.name} <span className="text-xs text-gray-400">v{t.version}{t.isLocked ? " · locked" : ""}</span></div>
              <div className="text-xs text-gray-500">{t.fields.length} fields · created by {t.createdBy.fullName}</div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowBuilder(t)} className="text-xs text-clinic-700 underline">{t.isLocked ? "Edit (creates v" + (t.version + 1) + ")" : "Edit"}</button>
              <button onClick={() => setGenerateFor(t)} className="text-xs text-clinic-700 underline">Generate workbook</button>
            </div>
          </div>
        ))}
      </div>

      {showBuilder && (
        <TemplateBuilder
          catalog={catalog}
          template={showBuilder}
          onClose={() => setShowBuilder(null)}
          onSaved={() => { setShowBuilder(null); load(); }}
        />
      )}
      {generateFor && (
        <GenerateModal template={generateFor} onClose={() => setGenerateFor(null)} />
      )}
    </div>
  );
}

function TemplateBuilder({ catalog, template, onClose, onSaved }: {
  catalog: CatalogField[]; template: Template; onClose: () => void; onSaved: () => void;
}) {
  const isNew = !template.id;
  const [name, setName] = useState(template.name);
  const [notes, setNotes] = useState(template.notes || "");
  const [fields, setFields] = useState<TemplateField[]>(template.fields.length ? template.fields : []);
  const [customLabel, setCustomLabel] = useState("");
  const [customType, setCustomType] = useState("TEXT");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggleCatalogField(cf: CatalogField) {
    setFields((prev) => {
      const exists = prev.find((f) => f.key === cf.key);
      if (exists) return prev.filter((f) => f.key !== cf.key);
      return [...prev, { ...cf }];
    });
  }

  function addCustomField() {
    if (!customLabel.trim()) return;
    setFields((prev) => [...prev, { key: "", label: customLabel, dataType: customType }]);
    setCustomLabel("");
  }

  function removeField(idx: number) {
    setFields((prev) => prev.filter((_, i) => i !== idx));
  }

  async function save() {
    if (!name.trim() || fields.length === 0) {
      setError("Name and at least one field are required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = { name, notes, fields: fields.map((f) => ({ key: f.key || undefined, label: f.label, dataType: f.dataType, options: f.options, unit: f.unit, section: f.section, mapsToCoreColumn: f.mapsToCoreColumn })) };
      if (isNew) await api.post("/templates", payload);
      else await api.put(`/templates/${template.id}`, payload);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save template");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-4 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-semibold">{isNew ? "New APE template" : `Edit ${template.name}`}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        {template.isLocked && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-2">This template has already been used for an import — saving will create version {template.version + 1} rather than changing existing records.</p>}

        <input placeholder="Template name" value={name} onChange={(e) => setName(e.target.value)} className="w-full border rounded px-2 py-1 text-sm mb-2" />
        <textarea placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full border rounded px-2 py-1 text-sm mb-3" rows={2} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h3 className="text-sm font-medium mb-2">Standard field catalog</h3>
            <div className="border rounded max-h-60 overflow-y-auto divide-y">
              {catalog.map((cf) => (
                <label key={cf.key} className="flex items-center gap-2 p-2 text-sm">
                  <input type="checkbox" checked={!!fields.find((f) => f.key === cf.key)} onChange={() => toggleCatalogField(cf)} />
                  {cf.label} <span className="text-gray-400 text-xs">({cf.dataType.toLowerCase()})</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <input placeholder="Custom field label" value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} className="flex-1 border rounded px-2 py-1 text-sm" />
              <select value={customType} onChange={(e) => setCustomType(e.target.value)} className="border rounded px-2 py-1 text-sm">
                {DATA_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <button onClick={addCustomField} className="bg-gray-100 rounded px-2 py-1 text-sm">Add</button>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-medium mb-2">Selected fields ({fields.length})</h3>
            <div className="border rounded max-h-72 overflow-y-auto divide-y">
              {fields.length === 0 && <div className="p-2 text-xs text-gray-400">No fields selected yet.</div>}
              {fields.map((f, i) => (
                <div key={`${f.key}-${i}`} className="flex justify-between items-center p-2 text-sm">
                  <span>{f.label}</span>
                  <button onClick={() => removeField(i)} className="text-xs text-red-600">Remove</button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm">Cancel</button>
          <button onClick={save} disabled={busy} className="bg-clinic-600 text-white rounded px-4 py-2 text-sm disabled:opacity-50">{busy ? "Saving..." : "Save template"}</button>
        </div>
      </div>
    </div>
  );
}

function GenerateModal({ template, onClose }: { template: Template; onClose: () => void }) {
  const [examYear, setExamYear] = useState(new Date().getFullYear().toString());
  const [rosterFill, setRosterFill] = useState(true);
  const [department, setDepartment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/templates/${template.id}/generate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examYear: Number(examYear), rosterFill, department: department || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Could not generate workbook");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `APE-${template.name.replace(/\s+/g, "_")}-${examYear}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate workbook");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-4 w-full max-w-sm">
        <h2 className="font-semibold mb-3">Generate workbook — {template.name}</h2>
        <div className="space-y-2 text-sm">
          <label className="block">Exam year
            <input type="number" value={examYear} onChange={(e) => setExamYear(e.target.value)} className="w-full border rounded px-2 py-1 mt-1" />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={rosterFill} onChange={(e) => setRosterFill(e.target.checked)} /> Pre-fill with active employee roster
          </label>
          <label className="block">Department filter (optional)
            <input value={department} onChange={(e) => setDepartment(e.target.value)} className="w-full border rounded px-2 py-1 mt-1" placeholder="Leave blank for all" />
          </label>
        </div>
        {error && <p className="text-red-600 text-xs mt-2">{error}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm">Cancel</button>
          <button onClick={generate} disabled={busy} className="bg-clinic-600 text-white rounded px-4 py-2 text-sm disabled:opacity-50">{busy ? "Generating..." : "Download workbook"}</button>
        </div>
      </div>
    </div>
  );
}
