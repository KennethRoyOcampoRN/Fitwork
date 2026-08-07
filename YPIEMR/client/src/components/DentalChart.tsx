import React, { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { TOOTH_STATUS_OPTIONS, TOOTH_STATUS_LABEL, UPPER_TEETH, LOWER_TEETH } from "../lib/dental";

interface Tooth {
  toothNumber: number;
  status: string;
  notes: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

const STATUS_STYLE: Record<string, { fill: string; stroke: string; dashed?: boolean }> = {
  HEALTHY: { fill: "#ffffff", stroke: "#9ca3af" },
  MISSING: { fill: "none", stroke: "#9ca3af", dashed: true },
  CARIES: { fill: "#dc2626", stroke: "#991b1b" },
};

// Arch layout: 16 positions per row along a shallow arc, front teeth (the
// middle of each row) pulled toward the vertical center and back molars
// (the ends) pushed toward the outer top/bottom corners — the standard
// "facing the patient" dental chart shape.
const CHART_WIDTH = 640;
const ARCH_SPREAD_DEG = 78;
function archPosition(indexInRow: number, baseY: number, amplitude: number, direction: 1 | -1) {
  const t = indexInRow / 15;
  const theta = (-ARCH_SPREAD_DEG + t * (2 * ARCH_SPREAD_DEG)) * (Math.PI / 180);
  const x = CHART_WIDTH / 2 + Math.sin(theta) * (CHART_WIDTH / 2 - 40);
  const y = baseY + direction * Math.cos(theta) * amplitude;
  return { x, y };
}

export default function DentalChart({ employeeId }: { employeeId: string }) {
  const { user } = useAuth();
  const [teeth, setTeeth] = useState<Tooth[] | null>(null);
  const [selected, setSelected] = useState<Tooth | null>(null);

  const canEdit = user?.role === "DENTIST";

  async function load() {
    const data = await api.get<{ teeth: Tooth[] }>(`/dental/employee/${employeeId}`);
    setTeeth(data.teeth);
  }
  useEffect(() => { load(); }, [employeeId]);

  if (!teeth) return <div className="text-sm text-gray-400 p-4">Loading dental chart...</div>;

  const byNumber = new Map(teeth.map((t) => [t.toothNumber, t]));

  function renderTooth(toothNumber: number, indexInRow: number, baseY: number, direction: 1 | -1, labelBelow: boolean) {
    const tooth = byNumber.get(toothNumber)!;
    const style = STATUS_STYLE[tooth.status] || STATUS_STYLE.HEALTHY;
    const { x, y } = archPosition(indexInRow, baseY, 46, direction);
    const labelY = labelBelow ? y + 20 : y - 16;

    return (
      <g
        key={toothNumber}
        onClick={canEdit ? () => setSelected(tooth) : undefined}
        style={{ cursor: canEdit ? "pointer" : "default" }}
      >
        <title>
          Tooth {toothNumber} — {TOOTH_STATUS_LABEL[tooth.status] || tooth.status}
          {tooth.notes ? `: ${tooth.notes}` : ""}
        </title>
        {/* Larger invisible hit area, easier to click/tap than the visible ring alone. */}
        <circle cx={x} cy={y} r={16} fill="transparent" />
        <circle
          cx={x} cy={y} r={12}
          fill={style.fill}
          stroke={style.stroke}
          strokeWidth={1.8}
          strokeDasharray={style.dashed ? "3,2" : undefined}
        />
        {tooth.status === "CARIES" && <circle cx={x} cy={y} r={3.5} fill="#7f1d1d" />}
        <text x={x} y={labelY} textAnchor="middle" fontSize={9} fill="#6b7280">{toothNumber}</text>
      </g>
    );
  }

  return (
    <div className="bg-white border rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-medium">Dental Chart</h2>
        {!canEdit && <span className="text-xs text-gray-400">View only — only dentists can update tooth status</span>}
      </div>

      <svg viewBox={`0 0 ${CHART_WIDTH} 260`} className="w-full max-w-2xl mx-auto">
        {UPPER_TEETH.map((n, i) => renderTooth(n, i, 70, 1, false))}
        <line x1={30} y1={130} x2={CHART_WIDTH - 30} y2={130} stroke="#e5e7eb" strokeDasharray="4,4" />
        {LOWER_TEETH.map((n, i) => renderTooth(n, i, 190, -1, true))}
      </svg>

      <div className="flex flex-wrap gap-4 justify-center text-xs mt-2">
        {TOOTH_STATUS_OPTIONS.map((s) => {
          const style = STATUS_STYLE[s.value];
          return (
            <span key={s.value} className="flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 14 14">
                <circle cx={7} cy={7} r={5.5} fill={style.fill} stroke={style.stroke} strokeWidth={1.5} strokeDasharray={style.dashed ? "2,1.5" : undefined} />
              </svg>
              {s.label}
            </span>
          );
        })}
      </div>

      {selected && (
        <ToothEditModal
          employeeId={employeeId}
          tooth={selected}
          onClose={() => setSelected(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}

function ToothEditModal({ employeeId, tooth, onClose, onSaved }: { employeeId: string; tooth: Tooth; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState(tooth.status);
  const [notes, setNotes] = useState(tooth.notes || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.put(`/dental/employee/${employeeId}/tooth/${tooth.toothNumber}`, { status, notes: notes.trim() || null });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save tooth status");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <form onSubmit={save} className="bg-white rounded-lg p-4 w-full max-w-sm space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="font-semibold">Tooth #{tooth.toothNumber}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm">
            {TOOTH_STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full border rounded px-2 py-1.5 text-sm" />
        </div>

        {tooth.updatedBy && (
          <p className="text-xs text-gray-400">Last updated by {tooth.updatedBy}{tooth.updatedAt ? ` on ${new Date(tooth.updatedAt).toLocaleString()}` : ""}</p>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm">Cancel</button>
          <button disabled={busy} className="bg-clinic-600 text-white rounded px-3 py-1.5 text-sm disabled:opacity-50">
            {busy ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
